import {
  createCartStore,
  createCartFormRegister,
  attachQuantityInput,
  formatMoney,
} from "@shopify/hydrogen";
import type {
  CartStore,
  CartFormRegister,
  CartState,
  CartLine,
  CartData,
} from "@shopify/hydrogen";

declare global {
  interface Window {
    Hydrogen?: { cart: CartStore; cartForm: CartFormRegister };
  }
}

/* ------------------------------------------------------------------ */
/* Store accessor (client-only). One shared cart store per page load.  */
/* ------------------------------------------------------------------ */

export function getCartStore(): CartStore {
  if (window.Hydrogen?.cart) return window.Hydrogen.cart;
  const cart = createCartStore();
  cart.connect();
  window.Hydrogen = { cart, cartForm: createCartFormRegister() };
  return cart;
}

export function getCartForm(): CartFormRegister {
  getCartStore();
  return window.Hydrogen!.cartForm;
}

/* ------------------------------------------------------------------ */
/* Render helpers — isomorphic (no window). Used server-side for the   */
/* /cart no-JS baseline and client-side for hydrated re-renders.       */
/* ------------------------------------------------------------------ */

// Structural view of CartState so server-rendered carts (built from CartData)
// and live store states share the same render code.
export interface CartViewState {
  data: CartData;
  loading: boolean;
  pending: { lines: Set<string>; discountCodes: Set<string>; note: boolean };
  errors: {
    network: { message?: string }[];
    cart: { userErrors: { message: string }[]; warnings: { message: string }[] } | null;
    lines: Map<string, { userErrors: { message: string }[]; warnings: { message: string }[] }>;
  };
}

export function viewStateFromCart(cart: CartData): CartViewState {
  return {
    data: cart,
    loading: false,
    pending: { lines: new Set(), discountCodes: new Set(), note: false },
    errors: { network: [], cart: null, lines: new Map() },
  };
}

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function attrs(o: object): string {
  return Object.entries(o)
    .map(([k, v]) => {
      if (v === false || v === undefined || v === null) return "";
      if (v === true) return k;
      return `${k}="${esc(v)}"`;
    })
    .filter(Boolean)
    .join(" ");
}

const LOCALE = "en-US";
const money = (m?: { amount: string; currencyCode: string } | null) =>
  m ? formatMoney(m, { locale: LOCALE }).toString() : "";

// Intent submit controls share a fixed contract: name="intent" value=<action>.
function intentButton(
  action: "increase" | "decrease" | "remove" | "discount-apply" | "discount-remove" | "note-update" | "add",
): string {
  return `type="submit" name="intent" value="${esc(action)}"`;
}

export function renderErrorBanner(state: CartViewState): string {
  const msgs = [
    ...state.errors.network.map((n) => n.message ?? "Network error"),
    ...(state.errors.cart?.userErrors ?? []).map((e) => e.message),
  ].filter(Boolean);
  if (!msgs.length) return "";
  return `<p class="cart-banner" role="alert">${msgs.map(esc).join(" ")}</p>`;
}

export function renderLine(form: CartFormRegister, line: CartLine, state: CartViewState): string {
  const merchandise = line.merchandise as {
    image?: { url: string; altText?: string | null } | null;
    title?: string | null;
    selectedOptions?: { name: string; value: string }[];
    product?: { title?: string | null; handle?: string | null };
  } | null;
  const product = merchandise?.product ?? {};
  const title = product.title ?? merchandise?.title ?? "Product";
  const handle = product.handle;
  const image = merchandise?.image;
  const options = merchandise?.selectedOptions ?? [];
  const pending = state.pending.lines.has(line.id);
  const lineErr = state.errors.lines.get(line.id);
  const errMessages = lineErr
    ? [...lineErr.userErrors, ...lineErr.warnings].map((e) => e.message).filter(Boolean)
    : [];
  const qty: object = form("quantity", { value: line.quantity, interactive: true });

  return `<li class="cart-line" data-line="${esc(line.id)}">
    <div class="cart-line__media">${
      image?.url
        ? `<img src="${esc(image.url)}" alt="${esc(image.altText ?? title)}" loading="lazy">`
        : `<span class="cart-line__placeholder"></span>`
    }</div>
    <div class="cart-line__body">
      <div class="cart-line__title">${
        handle ? `<a href="/products/${esc(handle)}">${esc(title)}</a>` : `<span>${esc(title)}</span>`
      }</div>
      ${
        options.length
          ? `<div class="cart-line__opts">${options
              .map((o) => `<span>${esc(o.name)}: ${esc(o.value)}</span>`)
              .join("")}</div>`
          : ""
      }
      <form class="cart-line__form" method="post" action="/api/cart" data-cart-form>
        <button ${attrs(form("set"))}></button>
        <input type="hidden" ${attrs(form("lineId", { value: line.id }))}>
        <span class="qty ${pending ? "is-pending" : ""}">
          <button ${intentButton("decrease")} aria-label="Decrease quantity">−</button>
          <input ${attrs(qty)}>
          <button ${intentButton("increase")} aria-label="Increase quantity">+</button>
        </span>
        <button class="link-btn" ${intentButton("remove")}>Remove</button>
      </form>
      ${
        errMessages.length
          ? `<p class="cart-line__error" role="alert">${errMessages.map(esc).join(" ")}</p>`
          : ""
      }
    </div>
    <div class="cart-line__total ${pending ? "is-pending" : ""}">${money(line.cost?.totalAmount)}</div>
  </li>`;
}

export function renderLines(form: CartFormRegister, state: CartViewState): string {
  const lines = state.data.lines.nodes;
  if (state.loading && lines.length === 0) return `<p class="cart-empty">Loading cart…</p>`;
  if (lines.length === 0)
    return `<p class="cart-empty">Your cart is empty. <a href="/collections">Continue shopping</a></p>`;
  return `<ul class="cart-lines">${lines.map((l) => renderLine(form, l, state)).join("")}</ul>`;
}

export function renderDiscounts(form: CartFormRegister, state: CartViewState): string {
  const codes = (state.data.discountCodes ?? []) as { code: string; applicable: boolean }[];
  return `<section class="cart-discounts">
    <form class="cart-discount__apply" method="post" action="/api/cart" data-cart-form>
      <input ${attrs(form("discountCode", { defaultValue: "" }))} placeholder="Discount code" autocomplete="off">
      <button ${intentButton("discount-apply")}>Apply</button>
    </form>
    ${codes
      .map(
        (c) => `<form class="cart-discount__chip" method="post" action="/api/cart" data-cart-form>
        <span>${esc(c.code)}</span>
        <input type="hidden" ${attrs(form("discountCode", { value: c.code }))}>
        <button ${intentButton("discount-remove")} aria-label="Remove discount ${esc(c.code)}">✕</button>
      </form>`,
      )
      .join("")}
  </section>`;
}

export function renderNote(form: CartFormRegister, state: CartViewState): string {
  const note = state.data.note ?? "";
  const pending = state.pending.note;
  const name = form("note", { value: note }).name;
  return `<form class="cart-note" method="post" action="/api/cart" data-cart-form>
    <label for="cart-note">Order note</label>
    <textarea id="cart-note" name="${esc(name)}">${esc(note)}</textarea>
    <button class="link-btn ${pending ? "is-pending" : ""}" ${intentButton("note-update")}>Save note</button>
  </form>`;
}

export function renderTotals(state: CartViewState): string {
  const cost = state.data.cost;
  const pending =
    state.pending.lines.size > 0 || state.pending.discountCodes.size > 0 || state.pending.note;
  return `<div class="cart-totals">
    <div class="cart-totals__row"><span>Subtotal</span><span class="${pending ? "is-pending" : ""}">${money(cost?.subtotalAmount)}</span></div>
    <div class="cart-totals__row cart-totals__row--total"><span>Total</span><span class="${pending ? "is-pending" : ""}">${money(cost?.totalAmount)}</span></div>
    <p class="cart-totals__note">Taxes and shipping calculated at checkout.</p>
  </div>`;
}

export function renderCheckout(state: CartViewState): string {
  const url = state.data.checkoutUrl;
  if (!url) return "";
  return `<a class="btn btn--checkout" href="${esc(url)}">Checkout</a>`;
}

/* ------------------------------------------------------------------ */
/* Mount: hydrate the shared store with server data, wire forms via    */
/* event delegation, and repaint on every state change.                */
/* ------------------------------------------------------------------ */

export interface CartMount {
  bannerEl?: HTMLElement | null;
  linesEl: HTMLElement;
  footerEl?: HTMLElement | null;
}

export function mountCart(initialData: CartData | null, mount: CartMount): CartStore {
  const store = getCartStore();
  const form = getCartForm();

  if (initialData) store.hydrate(initialData);

  function paint(state: CartState) {
    const view: CartViewState = {
      data: state.data,
      loading: state.loading,
      pending: state.pending,
      errors: state.errors,
    };
    if (mount.bannerEl) mount.bannerEl.innerHTML = renderErrorBanner(view);
    mount.linesEl.innerHTML = renderLines(form, view);

    const empty = state.data.lines.nodes.length === 0;
    if (mount.footerEl) {
      mount.footerEl.innerHTML = empty
        ? ""
        : renderDiscounts(form, view) + renderNote(form, view) + renderTotals(view) + renderCheckout(view);
      mount.footerEl.style.display = empty ? "none" : "";
    }

    // Wire the editable quantity inputs (Enter submits the set-quantity action).
    mount.linesEl.querySelectorAll<HTMLFormElement>("form[data-cart-form]").forEach((f) => {
      const input = f.querySelector<HTMLInputElement>('input[name="quantity"]');
      if (input) attachQuantityInput(input, f);
    });
  }

  // Event delegation: intercept submits from any cart form in lines or footer.
  const roots = [mount.linesEl, mount.footerEl].filter(Boolean) as HTMLElement[];
  for (const root of roots) {
    root.addEventListener("submit", (event) => {
      const formEl =
        event.target instanceof HTMLFormElement
          ? event.target
          : (event.target as HTMLElement | null)?.closest("form[data-cart-form]");
      if (!formEl) return;
      event.preventDefault();
      store.handleFormSubmit(event as SubmitEvent);
    });
  }

  store.subscribe(paint);
  paint(store.getState());
  return store;
}
