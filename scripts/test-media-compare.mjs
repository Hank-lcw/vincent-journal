import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Run the production comparison functions in a tiny DOM harness.
// No external test dependencies, and no access to private Studio data.
const source=fs.readFileSync('public/studio.js','utf8');
const start=source.indexOf('function compareOptionLabel(');
const end=source.indexOf('function campaignActions(',start);
assert.ok(start>=0 && end>start,'comparison implementation exists');
const compareCode=source.slice(start,end);

class MockElement {
  constructor(){
    this.style={};
    this.hidden=false;
    this.value='';
    this.textContent='';
    this.innerHTML='';
    this.attrs={};
    this.events={};
    const classes=new Set();
    this.classList={
      add:x=>classes.add(x), remove:x=>classes.delete(x),contains:x=>classes.has(x)
    };
  }
  addEventListener(name,callback){this.events[name]=callback}
  setAttribute(key,value){this.attrs[key]=value}
  getBoundingClientRect(){return {left:100,width:400}}
  setPointerCapture(){}
}
const elements=Object.fromEntries(
 ['compareStage','compareLeft','compareRight','compareLeftImg','compareRightImg',
  'compareRightClip','compareDivider','compareSlider','compareOut','compareModeNote']
 .map(id=>['#'+id,new MockElement()])
);
elements['.compare-range']=new MockElement();
elements['#compareSlider'].value='50';
elements['#compareLeft'].value='a';
elements['#compareRight'].value='b';
const images={
 '/studio/media/a':{width:1200,height:800},
 '/studio/media/b':{width:800,height:1000},
 '/studio/media/c':{width:1200,height:800},
 '/studio/media/d':{width:800,height:1000}
};
class MockImage{
 set src(value){
   this._src=value;
   const size=images[value]||{width:800,height:800};
   this.naturalWidth=size.width;
   this.naturalHeight=size.height;
   queueMicrotask(()=>this.onload?.());
 }
 get src(){return this._src}
}
const mediaCache=[
 {id:'a',filename:'a.jpg',parent_media_id:null},
 {id:'b',filename:'b.jpg',parent_media_id:null},
 {id:'c',filename:'c.jpg',parent_media_id:null},
 {id:'d',filename:'d.jpg',parent_media_id:'a',metadata:{derivative:true,crop:{
  source_px:{x:150,y:0,w:800,h:1000},output:{w:800,h:1000}
 }}}
];
const ctx={
  mediaCache, Image:MockImage,queueMicrotask,
  $:selector=>{assert.ok(elements[selector],selector);return elements[selector]},
  mediaUrl:m=>'/studio/media/'+m.id,
  mediaSourceLabel:()=> 'Derivative',
  mediaFamilyIndex:()=>1,
  mediaFamily:()=>mediaCache,
  rootMediaId:id=>id,
  e:value=>String(value),
  document:{
    createElement:tag=>{
      assert.equal(tag,'canvas');
      return {
        width:0,height:0,
        getContext:()=>({fillRect:()=>{},drawImage:()=>{},set fillStyle(x){},set imageSmoothingEnabled(x){},set imageSmoothingQuality(x){}}),
        toDataURL:()=> 'data:image/jpeg;base64,crop-preview'
      };
    }
  }
};
vm.createContext(ctx);
vm.runInContext(compareCode+'\nthis.compareTestApi={renderCompare,updateCompareSlider};',ctx);
const {renderCompare,updateCompareSlider}=ctx.compareTestApi;
const stage=elements['#compareStage'],right=elements['#compareRightClip'];
const divider=elements['#compareDivider'],range=elements['.compare-range'];
const input=elements['#compareSlider'];

await renderCompare(); // Different image proportions previously removed the divider.
assert.equal(range.hidden,false,'slider stays visible for different aspect ratios');
assert.equal(divider.hidden,false,'divider stays visible for different aspect ratios');
assert.equal(stage.classList.contains('is-side-by-side'),false,'no automatic side-by-side fallback');
assert.match(elements['#compareModeNote'].textContent,/比例不同/);
input.value='25';
updateCompareSlider();
assert.equal(right.style.clipPath,'inset(0 0 0 25%)');
assert.equal(divider.style.left,'25%');
assert.equal(divider.attrs['aria-valuenow'],'25');

// Pointer/touch movement across the preview itself must move both the image split and the slider.
stage.events.pointerdown({button:0,pointerId:3,clientX:300});
assert.equal(input.value,'50');
stage.events.pointermove({pointerId:3,clientX:400});
assert.equal(input.value,'75');
assert.equal(right.style.clipPath,'inset(0 0 0 75%)');
stage.events.pointerup({pointerId:3});
divider.events.keydown({key:'ArrowLeft',preventDefault(){}});
assert.equal(input.value,'70');

// Same-aspect pair should still use the interactive split.
elements['#compareRight'].value='c';
await renderCompare();
assert.equal(range.hidden,false);
assert.equal(stage.classList.contains('is-side-by-side'),false);

// Direct parent / crop derivative should align and also retain the splitter.
elements['#compareRight'].value='d';
await renderCompare();
assert.equal(divider.hidden,false);
assert.equal(range.hidden,false);
assert.equal(elements['#compareLeftImg'].src,'data:image/jpeg;base64,crop-preview');

console.log('MEDIA COMPARE REGRESSION OK: mixed aspect, same aspect, cropped child, pointer and keyboard');
