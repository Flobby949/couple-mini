import { beforeEach, expect, it, vi } from 'vitest'
const chooseMedia=vi.hoisted(()=>vi.fn())
vi.mock('@tarojs/taro',()=>({default:{chooseMedia}}))
import { chooseCover } from '../src/platform/media'
beforeEach(()=>vi.resetAllMocks())
it('turns native permission failures into a visible error instead of swallowing a plain object',async()=>{
 chooseMedia.mockRejectedValue({errMsg:'chooseMedia:fail auth deny'})
 await expect(chooseCover()).rejects.toThrow('权限')
})
it('keeps native cancellation distinguishable from a permission failure',async()=>{
 chooseMedia.mockRejectedValue({errMsg:'chooseMedia:fail cancel'})
 await expect(chooseCover()).rejects.toThrow('cancel')
})
it('accepts native local paths while still rejecting oversized covers',async()=>{
 chooseMedia.mockResolvedValueOnce({tempFiles:[{tempFilePath:'wxfile://tmp/photo.jpg',size:1024}]})
 expect(await chooseCover()).toBe('wxfile://tmp/photo.jpg')
 chooseMedia.mockResolvedValueOnce({tempFiles:[{tempFilePath:'wxfile://tmp/large.jpg',size:5*1024*1024+1}]})
 await expect(chooseCover()).rejects.toThrow('5 MiB')
})
