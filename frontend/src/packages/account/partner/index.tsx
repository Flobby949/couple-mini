import { Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { navigate, switchTab } from '../../../platform'
import { ErrorState, Loading } from '../../../ui'
import { ConnectedPair, InlineInfo, MenuRow } from '../../../ui/visual'

export default function PartnerPage() {
  const gate = useGate()
  return <Page title='彼此的小小后盾'>
    <ErrorState error={gate.error} retry={() => void gate.refetch()} />
    {!gate.canShow ? !gate.error && <Loading /> : <>
      <View className='relationship-hero'><ConnectedPair me={gate.data!.me} partner={gate.data!.partner!}/><Text className='tag'>已绑定 · 两个人，刚刚好</Text></View>
      <InlineInfo>一起完成任务、经营小店，让普通的日常也有回应。当前版本不提供解绑或换绑。</InlineInfo>
      <View className='surface menu partner-menu'><MenuRow icon='gift' title='赠送积分' description='送一份小小的鼓励' onClick={() => void navigate('/packages/account/gift/index')}/><MenuRow icon='order' title='共同规则' description='两个人，一起商量' onClick={() => void navigate('/packages/account/rules/index')}/><MenuRow icon='shop' title='伴侣的小店' description='发现对方准备的小心意' onClick={() => void switchTab('/pages/shop/index')}/></View>
    </>}
  </Page>
}
