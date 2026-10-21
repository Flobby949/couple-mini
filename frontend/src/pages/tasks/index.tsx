import { useGate } from '../../app/hooks'
import { Page } from '../../app/page'
import { Empty, ErrorState, Loading } from '../../ui'
import empty from '../../assets/empty-tasks.png'

export default function Tasks() {
  const gate = useGate()
  return <Page title='一起，把约定做好' subtitle='共同任务与伴侣任务，都从双方愿意开始。'><ErrorState error={gate.error} retry={() => void gate.refetch()} />{!gate.allowed ? <Loading /> : <Empty image={empty} title='任务功能准备中' description='本轮先完成绑定、共同规则与签到；任务发布和奖励结算将在后续阶段开放。' />}</Page>
}
