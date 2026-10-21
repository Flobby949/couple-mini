import { Button, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { navigate, switchTab } from '../../../platform'
import { ErrorState, Loading } from '../../../ui'

export default function PartnerPage() {
  const gate = useGate()
  return <Page title='彼此的小小后盾' subtitle='两个人各自经营，也一起约定。'>
    <ErrorState error={gate.error} retry={() => void gate.refetch()} />
    {!gate.allowed ? <Loading /> : <><View className='surface partner-summary'><Text className='section-title'>{gate.data!.me.nickname} 与 {gate.data!.partner!.nickname}</Text><Text className='tag'>已绑定</Text><Text className='muted'>一起完成任务、经营小店，让普通的日常也有回应。</Text></View>
      <View className='surface menu'><Button className='menu-item' onClick={() => void navigate('/packages/account/gift/index')}>赠送积分 <Text>›</Text></Button><Button className='menu-item' onClick={() => void navigate('/packages/account/rules/index')}>共同规则 <Text>›</Text></Button><Button className='menu-item' onClick={() => void switchTab('/pages/shop/index')}>查看伴侣小店 <Text>›</Text></Button></View><Text className='muted'>当前版本不提供解绑或换绑。</Text></>}
  </Page>
}
