import { useQuery } from '@tanstack/react-query'
import { Button, Image, Text, View } from '@tarojs/components'
import { Page } from '../../../app/page'
import { useGate } from '../../../app/hooks'
import { getHome } from '../../../features/home/api'
import { keys } from '../../../core/query'
import { switchTab } from '../../../platform'
import { ErrorState, Loading } from '../../../ui'
import { ConnectedPair, Icon, InlineInfo } from '../../../ui/visual'
import panel from '../../../assets/checkin-fabric-panel.png'

export default function MilestonesPage(){
 const gate=useGate(),query=useQuery({queryKey:keys.home,queryFn:getHome,enabled:gate.allowed,refetchInterval:gate.allowed?15000:false})
 const data=gate.allowed?query.data:undefined,days=data?.context.couple?.doubleDays??0
 return <Page title='累计双人签到'><ErrorState error={gate.error||query.error} retry={()=>{void gate.refetch();void query.refetch()}}/>{!data&&!query.error&&!gate.error&&<Loading/>}{data&&<>
  <View className='milestone-hero'><Image className='fabric' src={panel} mode='scaleToFill' ariaHidden/><ConnectedPair me={data.context.me} partner={data.context.partner!}/><Text className='muted'>我们已经一起签到</Text><Text><Text className='milestone-days'>{days}</Text> 天</Text><Text className='muted'>我{data.checkin.me?'已':'未'}签到 · {data.context.partner!.nickname}{data.checkin.partner?'已':'未'}签到</Text></View>
  <InlineInfo>双方在同一天签到，累计天数就 +1。漏签不会清零，每个里程碑奖励只发放一次，全部进入共同积分池。</InlineInfo>
  <View className='surface milestone-list'>{data.milestones.map(m=><View className={`milestone-step ${days>=m.days?'achieved':''}`} key={m.days}><View className='milestone-marker'>{days>=m.days?<Icon name='check' tone='primary' size={18}/>:<Text>◆</Text>}</View><View className='milestone-copy'><Text className='section-title'>{m.days} 天</Text></View><Text className='milestone-reward'>+{m.reward} 积分</Text><Text className='tag'>{days>=m.days?'已达成':`还差 ${m.days-days} 天`}</Text></View>)}</View>
  <Button className='button secondary' onClick={()=>void switchTab('/pages/home/index')}>回到首页，继续陪伴</Button>
 </>}</Page>
}
