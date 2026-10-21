// Display-only navigation context. The API always verifies the live confirmed price.
let observed: { productId: string; price: number } | undefined
export function rememberCheckoutPrice(productId: string, price: number) { observed = { productId, price } }
export function checkoutPrice(productId: string) { return observed?.productId === productId ? observed.price : undefined }
export function clearCheckoutPrice(productId?: string) { if (!productId || observed?.productId === productId) observed = undefined }
