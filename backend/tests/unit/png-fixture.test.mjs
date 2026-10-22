import { it, expect } from 'vitest'
import { crc32, inflateSync } from 'node:zlib'
import { png } from '../helpers/fixture.mjs'
it('the upload fixture has valid PNG chunk CRCs and a complete one-pixel scanline',()=>{
 expect(png.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]))
 for(let offset=8;offset<png.length;){
   const length=png.readUInt32BE(offset)
   const chunk=png.subarray(offset+4,offset+8+length)
   expect(crc32(chunk)).toBe(png.readUInt32BE(offset+8+length))
   if(chunk.subarray(0,4).toString()==='IDAT')expect(inflateSync(chunk.subarray(4))).toEqual(Buffer.from([0,255,0,0,255]))
   offset+=12+length
 }
})
