import { expect, it, vi } from 'vitest'
import { act, create } from 'react-test-renderer'
vi.mock('@tarojs/components', () => ({ Button: 'button', Input: 'input', Text: 'text', View: 'view' }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: { stage: 'binding', me: { id: 'alice', nickname: '我' } }, error: null, refetch: vi.fn() }) }))
vi.mock('../src/app/page', () => ({ Page: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../src/app/hooks', () => ({ useVisible: () => true, routeContext: vi.fn() }))
vi.mock('../src/core/query', () => ({ keys: { context: ['context'] } }))
vi.mock('../src/core/api', () => ({ session: () => ({ user: { id: 'alice' } }) }))
vi.mock('../src/core/use-action', () => ({ useAction: () => ({ busy: false, error: null, run: vi.fn() }) }))
vi.mock('../src/platform', () => ({ copy: vi.fn(), redirect: vi.fn() }))
vi.mock('../src/features/identity/api', () => ({ getContext: vi.fn(), invitePartner: vi.fn(), bindPartner: vi.fn() }))
vi.mock('../src/ui/visual', () => ({ ConnectedPair: () => null, Icon: () => null, InlineInfo: () => null }))
import Binding from '../src/packages/account/binding'

it('can leave the invitation input step using an in-page control when native navigation has no back entry', () => {
  let tree: ReturnType<typeof create>
  act(() => { tree = create(<Binding/>) })
  const buttonWithText = (label: string) => tree!.root.findAllByType('button').find(button => button.children.some(child => typeof child === 'string' && child.trim() === label) || button.findAllByType('text').some(text => text.children.join('').trim() === label))
  act(() => buttonWithText('我有邀请码，去绑定')!.props.onClick())
  expect(buttonWithText('确认绑定')!.props.disabled).toBe(true)
  const returnButton = buttonWithText('返回邀请页')
  expect(returnButton).toBeDefined()
  act(() => returnButton!.props.onClick())
  expect(buttonWithText('生成邀请码')).toBeDefined()
  expect(buttonWithText('确认绑定')).toBeUndefined()
  act(() => tree!.unmount())
})
