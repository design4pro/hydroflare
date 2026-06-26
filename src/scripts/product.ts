import {
  createProductFormStore,
  createProductFormRegister,
  canAddToCart,
  formatMoney,
} from "@shopify/hydrogen";
import { getCartStore } from "./cart";

const LOCALE = "en-US";
const money = (m?: { amount: string; currencyCode: string } | null) =>
  m ? formatMoney(m, { locale: LOCALE }).toString() : "";

function esc(s: unknown): string {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

interface ProductMounts {
  options: HTMLElement;
  price: HTMLElement;
  buy: HTMLElement;
}

/**
 * Hydrate a server-rendered product detail page with the Hydrogen product form
 * store. Owns option selection (URL-synced), price/variant display, and the
 * add-to-cart form. The server render remains the no-JS baseline.
 */
export function mountProduct(product: any, mounts: ProductMounts) {
  const cartStore = getCartStore();
  const store = createProductFormStore(product, cartStore);
  const optionNames: string[] = (product.options ?? []).map((o: any) => o.name);

  function syncUrl(selectedOptions: { name: string; value: string }[]) {
    const url = new URL(window.location.href);
    for (const name of optionNames) url.searchParams.delete(name);
    for (const o of selectedOptions) url.searchParams.set(o.name, o.value);
    window.history.replaceState({}, "", url);
  }

  function selectOption(name: string, value: string) {
    const result = store.selectOption(name, value);
    if (result.status !== "invalid") syncUrl(result.selectedOptions);
  }

  // Delegated option selection (survives innerHTML repaints).
  mounts.options.addEventListener("click", (event) => {
    const el = (event.target as HTMLElement | null)?.closest(
      "[data-option-value]",
    ) as HTMLAnchorElement | null;
    if (!el) return;
    if (el.dataset.crossProduct === "true") return; // combined listing → navigate
    event.preventDefault();
    selectOption(el.dataset.optionName!, el.dataset.optionValue!);
  });

  // Delegated add-to-cart submit (survives buy repaints).
  mounts.buy.addEventListener("submit", async (event) => {
    const form =
      event.target instanceof HTMLFormElement
        ? event.target
        : (event.target as HTMLElement | null)?.closest("form[data-product-form]");
    if (!form) return;
    event.preventDefault();
    try {
      await store.handleFormSubmit(event as SubmitEvent);
      (window as any).Shopify?.actions?.openCart?.();
    } catch {
      /* errors surface via store state */
    }
  });

  function paint(state: any) {
    const register = createProductFormRegister(state.selectedVariant, selectOption);

    // --- option selectors ---
    mounts.options.innerHTML = (state.options ?? [])
      .map(
        (opt: any) => `<fieldset class="option">
        <legend>${esc(opt.name)}</legend>
        <div class="option__values">
          ${opt.values
            .map((v: any) => {
              const cross = v.handle && v.handle !== product.handle;
              const href = cross
                ? `/products/${encodeURIComponent(v.handle)}?${v.selectedOptions
                    .map((o: any) => `${encodeURIComponent(o.name)}=${encodeURIComponent(o.value)}`)
                    .join("&")}`
                : `?${encodeURIComponent(opt.name)}=${encodeURIComponent(v.name)}`;
              const disabled = v.exists === false;
              const soldOut = v.exists !== false && v.available === false;
              const cls = [
                "option__value",
                v.selected ? "is-selected" : "",
                disabled ? "is-disabled" : "",
                soldOut ? "is-soldout" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return `<a class="${cls}" href="${esc(href)}"
                  data-option-name="${esc(opt.name)}"
                  data-option-value="${esc(v.name)}"
                  data-cross-product="${cross ? "true" : "false"}"
                  ${disabled ? 'aria-disabled="true"' : ""}
                  aria-pressed="${v.selected}">${esc(v.name)}${
                    soldOut ? ' <span class="option__soldout">Sold out</span>' : ""
                  }</a>`;
            })
            .join("")}
        </div>
      </fieldset>`,
      )
      .join("");

    // --- price (server-provided only) ---
    const variant = state.selectedVariant;
    const price = variant?.price ?? product.priceRange?.minVariantPrice;
    const compare = variant?.compareAtPrice;
    mounts.price.innerHTML = `${compare ? `<s class="price__compare">${esc(money(compare))}</s> ` : ""}<span class="price__current">${esc(money(price))}</span>`;

    // --- add-to-cart form ---
    const addable = canAddToCart(product, state.options);
    const merch = register("merchandiseId", {});
    const cta = !variant
      ? "Select options"
      : variant.availableForSale === false
        ? "Sold out"
        : "Add to cart";
    const errMsgs = [
      ...(state.errors?.userErrors ?? []),
      ...(state.errors?.warnings ?? []),
    ]
      .map((e: any) => e.message)
      .filter(Boolean);
    mounts.buy.innerHTML = `<form class="buy-form" method="post" action="/api/cart" data-product-form>
        <input type="hidden" name="${esc(merch.name)}" value="${esc(merch.value)}">
        <label class="buy-form__qty">Qty
          <input type="number" name="quantity" value="1" min="1" step="1">
        </label>
        <button class="btn" type="submit" name="intent" value="add" ${addable ? "" : "disabled"}>${esc(cta)}</button>
      </form>
      ${
        errMsgs.length
          ? `<p class="buy-form__error" role="alert">${errMsgs.map(esc).join(" ")}</p>`
          : ""
      }`;
  }

  store.subscribe(paint);
  paint(store.getState());
  return store;
}
