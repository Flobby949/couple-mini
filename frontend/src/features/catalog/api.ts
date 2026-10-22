import { request } from '../../core/api'
import { mutate } from '../../core/operations'
import type { Catalog, Product, ProductDetail } from '../../contracts/commerce'
export const getCatalog = (view: 'mine' | 'partner') => request<Catalog>(`/catalog?view=${view}`)
export const getProduct = (id: string) => request<ProductDetail>(`/products/${encodeURIComponent(id)}`)
export const saveProduct = (id: string | undefined, body: { name: string; description: string; coverId: string; price: string; stock: number }) => mutate<Product>(`/products${id ? '/' + encodeURIComponent(id) : ''}`, body)
