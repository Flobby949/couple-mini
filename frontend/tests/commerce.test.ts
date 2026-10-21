import { expect, it } from 'vitest'
import { parseStock } from '../src/core/values'
import { cancellationPreview, purchaseBlock } from '../src/features/orders/presentation'
import type { Order } from '../src/contracts/commerce'
import { checkoutPrice, clearCheckoutPrice, rememberCheckoutPrice } from '../src/features/orders/checkout-intent'

it('a negative balance blocks free orders; zero balance permits in-stock free orders', () => {
  expect(purchaseBlock(-1, 1, 0)).toContain('非负')
  expect(purchaseBlock(0, 1, 0)).toBe('')
  expect(purchaseBlock(0, 0, 0)).toContain('暂无库存')
  expect(purchaseBlock(20, 1, 21)).toContain('积分不足')
})
it('stock never rounds decimals or turns empty input into zero', () => {
  for (const raw of ['', '-0.1', '1.5', '1e2', '1000001', '9999999999999999999']) expect(parseStock(raw)).toBeNull()
  expect(parseStock('0')).toBe(0)
  expect(parseStock('1000000')).toBe(1000000)
})
it('seller cancellation uses the immutable order price and may make the balance negative', () => {
  const order = { sellerId: 'seller', status: 'fulfilling', snapshot: { price: 21 } } as Order
  expect(cancellationPreview(order, 'seller', 5)).toEqual({ refund: 21, penalty: 11, balanceAfter: -6 })
  expect(cancellationPreview(order, 'buyer', 5).penalty).toBe(0)
  expect(cancellationPreview({ ...order, status: 'pending' }, 'seller', 5).penalty).toBe(0)
  expect(cancellationPreview({ ...order, snapshot: { ...order.snapshot, price: 0 } }, 'seller', -6).penalty).toBe(0)
})
it('retains the source price across navigation even when the first detail fetch has a new price', () => {
  rememberCheckoutPrice('from-cart', 21)
  expect(checkoutPrice('from-cart')).toBe(21)
  expect(checkoutPrice('other-product')).toBeUndefined()
  clearCheckoutPrice('other-product')
  expect(checkoutPrice('from-cart')).toBe(21)
  clearCheckoutPrice('from-cart')
  expect(checkoutPrice('from-cart')).toBeUndefined()
})
