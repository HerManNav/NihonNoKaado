const test = require('node:test');
const assert = require('node:assert/strict');
const {meaningParts,meaningHead,senseScore,spellingDistance,wordKey} = require('../example-search.js');

const noteCases = [
  ['ticket (bus, train)', ['ticket']],
  ['ticket [bus; train]', ['ticket']],
  ['ticket {bus / train}', ['ticket']],
  ['ticket 【bus, train】', ['ticket']],
  ['ticket （bus， train）；pass', ['ticket','pass']],
  ['ticket (bus [local, express], train) / pass (entry, access)', ['ticket','pass']],
  ['ticket (bus or train); pass', ['ticket','pass']],
  ['ticket (bus, train', ['ticket']],
  ['ticket (bus, train] / pass', ['ticket']],
  ['ticket) / pass', ['ticket','pass']],
  ['(n.) ticket; [v.] pass', ['ticket','pass']],
  ['(be) asleep / (be) awake', ['asleep','awake']],
  ['“ticket (bus, train)” / \'pass (entry, access)\'', ['ticket','pass']],
  ['ticket (label ")", train) / pass', ['ticket','pass']],
  ['ticket (e.g. bus, train); pass', ['ticket','pass']],
  [' ticket\u00a0(bus, train) / tick\u200bet ', ['ticket','ticket']],
];
for (const [input,expected] of noteCases) test(`meaning notes: ${input}`,()=> {
  assert.deepEqual(meaningParts(input).map(meaningHead),expected);
  if (expected.includes('ticket')) {
    assert.ok(senseScore(input,'ticket')>0);
    assert.equal(senseScore(input,'bus'),0);
    assert.equal(senseScore(input,'train'),0);
  }
});

for(const [input,expected] of [
  ['"a, b" / c',['"a, b"','c']],
  ['"eat or drink"; sleep',['"eat or drink"','sleep']],
  ["someone's ticket / children's pass",["someone's ticket","children's pass"]],
  ['e.g. / i.e. / etc.',['e.g.','i.e.','etc.']],
  ['Dr. Smith; Mr. Jones',['dr. smith','mr. jones']],
  ['a.m. / p.m.',['a.m.','p.m.']],
  ['1.5; 1/2; 1,000; 1,000,000',['1.5','1/2','1,000','1,000,000']],
  ['w/o sugar / w/ milk',['w/o sugar','w/ milk']],
  ['n/a; i/o',['n/a','i/o']],
  ['more or less / sooner or later',['more or less','sooner or later']],
  ['whether or not; all or nothing; give or take; now or never',['whether or not','all or nothing','give or take','now or never']],
  ['check-in; black-and-white',['check-in','black-and-white']],
  [' / ; , . |\n () [] {} 【】',[]],
  ['ticket / ticket / (bus, train)',['ticket']],
]) test(`protected meaning punctuation: ${input}`,()=>assert.deepEqual(meaningParts(input),expected));

test('optional notes preserve homographs and negative meanings',()=> {
  assert.ok(senseScore('ticket (bus, train)','ticket'));
  assert.ok(senseScore('ticket','ticket (bus, train)'));
  assert.equal(senseScore('bank (river edge)','bank (financial institution)'),0);
  assert.equal(senseScore('ticket (bus, train)','bus / train'),0);
  assert.ok(senseScore("don't eat (raw food)",'not eat'));
  assert.ok(senseScore("doesn't eat",'do not eat'));
  assert.ok(senseScore('w/o sugar','without sugar'));
  for(const negative of ['not good','without sugar','never eat',"don't eat"]) {
    assert.equal(senseScore(negative,negative.replace(/not |without |never |don't /,'')),0);
  }
  for(const invalid of ['',null,undefined,'(bus, train)','[bus or train]']) {
    assert.equal(senseScore(invalid,'bus'),0);
    assert.equal(senseScore(invalid,invalid),0);
  }
  assert.equal(senseScore('give up','give'),0);
  assert.equal(senseScore('more or less','more'),0);
});

// Independent full-matrix oracle: check pruning and transpositions over every
// short string in this alphabet, including empty inputs and repeated vowels.
function distanceOracle(a,b) {
  const vowel=char=>'aeiou'.includes(char || '!');
  const cost=(word,index)=>vowel(word[index])?(word[index]===word[index-1]||word[index]===word[index+1]?0.35:0.7):1;
  const d=Array.from({length:a.length+1},()=>new Array(b.length+1).fill(0));
  for(let i=1;i<=a.length;i++)d[i][0]=d[i-1][0]+cost(a,i-1);
  for(let j=1;j<=b.length;j++)d[0][j]=d[0][j-1]+cost(b,j-1);
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++) {
    d[i][j]=Math.min(d[i-1][j]+cost(a,i-1),d[i][j-1]+cost(b,j-1),d[i-1][j-1]+(a[i-1]===b[j-1]?0:vowel(a[i-1])&&vowel(b[j-1])?0.7:1));
    if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+0.75);
  }
  return d[a.length][b.length];
}
test('bounded spelling distance agrees with a full-matrix oracle for 1,600 short-string pairs',()=> {
  const words=[''];
  for(let length=1;length<=3;length++)for(const prefix of words.filter(word=>word.length===length-1))for(const char of ['a','b','o'])words.push(prefix+char);
  for(const a of words)for(const b of words) {
    const expected=distanceOracle(a,b);
    for(const limit of [0,0.35,0.7,0.75,1,1.7,2.2]) {
      const actual=spellingDistance(a,b,limit);
      if(expected>limit)assert.equal(actual,Infinity,`${a}/${b}/${limit}`);
      else assert.ok(Math.abs(actual-expected)<1e-9,`${a}/${b}/${limit}: ${actual} vs ${expected}`);
    }
  }
});
test('normalization keeps existing romaji variants equivalent after the ASCII fast path',()=> {
  for(const [a,b] of [['SHASHIN','しゃしん'],['gakkō','がっこう'],["shin'ya",'しんや'],['koohii','コーヒー'],['kuukoo','くうこう'],['fuji','huzi']])assert.equal(wordKey(a),wordKey(b));
});
