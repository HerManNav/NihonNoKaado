const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function block(start,end) {
  const from = source.indexOf(start), to = source.indexOf(end,from);
  assert.ok(from>=0 && to>from);
  return source.slice(from,to);
}

function harness({transition=true,listTop=430,pageTop=870,lastTop=999}={}) {
  const screens={deck:{hidden:false},add:{hidden:true},home:{hidden:true}};
  const transitions=[],frames=[],focuses=[],scrolls=[],renders=[],inspections=[];
  const example={romaji:'ringo wo taberu.',hiragana:'りんごをたべる。',english:'Eat an apple.',wordMeanings:[]};
  const cards=[{id:'a',japanese:'neko',hiragana:'ねこ',english:'cat',meanings:['cat'],examples:[]},
    {id:'b',japanese:'taberu',hiragana:'たべる',english:'eat',meanings:['eat'],examples:[example]}];
  const group={querySelector:selector=>({value:{'.meaning-translation':'eat','.meaning-example-romaji':example.romaji,
    '.meaning-example-hiragana':example.hiragana,'.meaning-example-english':example.english}[selector]})};
  const editButton={focus:options=>focuses.push(options)};
  const wordList={scrollTop:listTop,children:[{}, {}, {querySelector:()=>editButton}],addEventListener:()=>{}};
  const cardForm={dataset:{},addEventListener:(event,fn)=>{if(event==='submit') cardForm.submit=fn;}};
  const japaneseInput={value:'',focus:()=>{}};
  const document=transition ? {startViewTransition:update=>{transitions.push(update);}} : {};
  const window={scrollY:pageTop,scrollTo:(x,y)=>scrolls.push([x,y]),alert:()=>assert.fail('unexpected save error')};
  const context=vm.createContext({screens,document,window,wordList,cardForm,japaneseInput,hiraganaInput:{value:''},
    englishMeanings:{querySelectorAll:()=>[group]},exampleControllers:new Map([[group,{inspect:()=>inspections.push('inspect')}]]),
    cards,editingDeckScrollTop:0,lastDeckScrollTop:lastTop,editingPageScrollTop:0,editingCardIndex:null,formReturnScreen:'home',
    hiraganaManuallyEdited:false,formTitle:{},formSubmitButton:{},cancelEditButton:{},backToLearningButton:{},enterHint:{},
    resetMeaningInputs:()=>{},romajiToHiragana:()=>'',compactHiragana:value=>value,
    renderDeckList:index=>{assert.equal(screens.deck.hidden,false,'deck must be visible before rendering');renders.push(index);wordList.scrollTop=0;},
    requestAnimationFrame:fn=>frames.push(fn),cancelPracticeTimers:()=>{},hideWordTranslationPopup:()=>{},
    updateDeckCount:()=>{},renderAddDeckMatches:()=>{},wordPopupBlocksCardAdvance:false,
    waitForExampleSuggestions:async()=>{},exampleFormSignature:()=> 'unchanged',
    prepareExampleAnnotations:async(_groups,_japanese,examples)=>examples,
    updateCardAt:(existing,index,changes)=>existing.map((card,i)=>i===index?{...card,...changes}:card),
    saveCards:()=>true,migrateLearningKey:()=>{},crypto:{randomUUID:()=> 'new'},
  });
  vm.runInContext(block('function showScreen(name','// Called by Android'),context);
  vm.runInContext(block('function startEditingCard(index)','function compactHiragana'),context);
  vm.runInContext(block('cardForm.addEventListener("submit"','japaneseInput.addEventListener("input"'),context);
  const flushTransition=()=>{const update=transitions.shift();assert.ok(update,'expected transition');update();};
  const enter=()=>{context.startEditingCard(1);if(transition)flushTransition();assert.equal(screens.add.hidden,false);};
  return {context,screens,wordList,cardForm,transitions,frames,focuses,scrolls,renders,inspections,flushTransition,enter};
}

for (const transition of [true,false]) for (const action of ['cancel','save']) {
  test(`${action} restores both scroll positions and edited row after ${transition?'delayed':'immediate'} screen switch`,async()=> {
    const h=harness({transition});h.enter();assert.equal(h.inspections.length,1);
    h.wordList.scrollTop=0;h.context.window.scrollY=0;
    if(action==='cancel') h.context.cancelCardForm();
    else await h.cardForm.submit({preventDefault:()=>{}});
    if(transition) {assert.equal(h.renders.length,0);h.flushTransition();}
    assert.deepEqual(h.renders,[action==='save'?1:-1]);
    assert.equal(h.frames.length,0,'restore scroll before the new screen is painted');
    assert.equal(h.wordList.scrollTop,430);
    assert.deepEqual(h.scrolls,[[0,870]]);
    assert.equal(h.focuses.length,1);assert.equal(h.focuses[0].preventScroll,true);
    assert.equal(h.context.editingCardIndex,null);
    assert.equal(h.screens.deck.hidden,false);
  });
}

test('zero list scroll is preserved instead of an obsolete previous scroll position',()=> {
  const h=harness({listTop:0,pageTop:250,lastTop:500});h.enter();h.context.cancelCardForm();h.flushTransition();
  assert.equal(h.wordList.scrollTop,0);assert.deepEqual(h.scrolls,[[0,250]]);
});

test('save failure stays in edit mode and does not alter the deck position',async()=> {
  const h=harness();h.enter();h.context.saveCards=()=>false;h.context.window.alert=()=>{};
  await h.cardForm.submit({preventDefault:()=>{}});
  assert.equal(h.context.editingCardIndex,1);assert.equal(h.screens.add.hidden,false);
  assert.equal(h.transitions.length,0);assert.equal(h.frames.length,0);
});
