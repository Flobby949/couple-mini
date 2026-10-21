import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { Empty, ErrorState, Loading } from '../../ui'
import empty from '../../assets/empty-store.png'

export default function Shop() {
  const gate = useGate()
  return <Page title='只为你开的小店' subtitle='用积分，兑换一份属于两个人的小确幸。'><ErrorState error={gate.error} retry={() => void gate.refetch()} />{!gate.allowed ? <Loading /> : <Empty image={empty} title='小店功能准备中' description='双方的小店已在绑定时建立；商品、页内购物车与订单将在后续阶段开放。' />}</Page>
}
