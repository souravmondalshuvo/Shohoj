const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/CodeEditor-JHpDusXl.js","assets/jsx-runtime-Wy9s6hX0.js","assets/questProgressRepo-DFx3Zyla.js","assets/index-Ddu4xWs6.js","assets/react-dom-g7hNCJoM.js","assets/AuthProvider-C62y67Eh.js","assets/errors-DlEQl-Yx.js","assets/Button-CCTUrmz7.js","assets/Portal-Bb14G5VZ.js","assets/result-DZutzm4Y.js","assets/catalog-CifCq60_.js","assets/logger-D1Dkmc5H.js","assets/schema-BkaGxjtv.js","assets/index-BdbK1D1D.css"])))=>i.map(i=>d[i]);
import{a as e,i as t,n,t as r}from"./jsx-runtime-Wy9s6hX0.js";import{t as i}from"./react-dom-g7hNCJoM.js";import{ct as a,ot as o,y as s}from"./index-Ddu4xWs6.js";import{a as c,d as l,i as u,l as d,n as f,o as p,r as m,s as h,t as g,u as _}from"./schema-BkaGxjtv.js";import{r as v,t as y}from"./result-DZutzm4Y.js";import{c as b,r as x}from"./AuthProvider-C62y67Eh.js";var S=e(n(),1),C=i(),w={bridge:()=>o(()=>import(`./bridge-DWBPrDFh.js`).then(e=>e.default),[])},T=`__BLANK__`,E=3e3,D=_().max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,`use lowercase words joined by hyphens`),O=_().regex(/^[A-Za-z_][A-Za-z0-9_]*$/,`not a Java identifier`),k=_().min(1),A=_().min(1),j=f([`int`,`long`,`double`,`boolean`,`char`,`String`,`int[]`,`long[]`,`double[]`,`boolean[]`,`char[]`,`String[]`]),M=l([h(),u(),_()]),N=l([M,m(M)]),P=-2147483648,ee=2147483647;function F(e,t){switch(e){case`int`:return typeof t==`number`&&Number.isInteger(t)&&t>=P&&t<=ee;case`long`:return typeof t==`number`&&Number.isSafeInteger(t);case`double`:return typeof t==`number`&&Number.isFinite(t);case`boolean`:return typeof t==`boolean`;case`char`:return typeof t==`string`&&t.length===1;case`String`:return typeof t==`string`;default:return!1}}function I(e,t){if(e.endsWith(`[]`)){let n=e.slice(0,-2);return Array.isArray(t)&&t.every(e=>F(n,e))}return!Array.isArray(t)&&F(e,t)}var te=c(`kind`,[d({kind:p(`requires`),anyOf:m(_().min(1)).min(1),message:k}),d({kind:p(`atMost`),token:_().min(1),max:h().int().min(0),message:k})]),ne={name:_().min(1).optional(),hidden:u().default(!1),hint:_().min(1).optional()},re=d({...ne,stdin:_().default(``),expected:_()}),ie=d({...ne,args:m(N),expected:N.optional(),expectedStdout:_().optional()}),ae=d({mode:p(`stdio`),tests:m(re).min(1)}),oe=d({mode:p(`method`),className:O.default(`Solution`),method:d({name:O,params:m(d({type:j,name:O})),returns:l([j,p(`void`)])}),tests:m(ie).min(1)}),se=c(`mode`,[ae,oe]),ce={id:D,title:_().min(1).max(60),story:m(k).min(1),task:k,concepts:m(_().min(1)).min(1),xp:h().int().min(0).max(1e3),hints:m(k).default([]),requires:m(D).default([]),boss:u().default(!1)},le={...ce,grading:se,rules:m(te).default([]),timeLimitMs:h().int().min(500).max(1e4).default(E)},ue=d({...le,type:p(`write`),starter:A}),de=d({...le,type:p(`fix`),starter:A}),fe=d({...le,type:p(`fill`),template:A}),pe=d({...ce,type:p(`predict`),snippet:A,answer:_().min(1),explanation:k}),me=d({grid:m(_().min(1)).min(1),facing:f([`N`,`E`,`S`,`W`])}),he=d({...ce,type:p(`hero`),starter:A,level:me,goal:d({reach:u().default(!0),collectAll:u().default(!1)}).default({reach:!0,collectAll:!1}),maxActions:h().int().min(1).max(2e3).default(200),rules:m(te).default([]),timeLimitMs:h().int().min(500).max(1e4).default(E)});function ge(e,t){let{params:n,returns:r}=e.method;e.tests.forEach((e,i)=>{let a=[`grading`,`tests`,i];e.args.length!==n.length&&t(`expected ${n.length} argument(s), got ${e.args.length}`,[...a,`args`]),e.args.forEach((e,r)=>{let i=n[r];i&&!I(i.type,e)&&t(`argument ${r+1} is not a valid ${i.type}`,[...a,`args`,r])}),r===`void`?(e.expected!==void 0&&t(`a void method has no return value to expect`,[...a,`expected`]),e.expectedStdout===void 0&&t(`a void method needs expectedStdout`,[...a,`expectedStdout`])):e.expected===void 0?t(`expected is required for a method returning ${r}`,[...a,`expected`]):I(r,e.expected)||t(`expected is not a valid ${r}`,[...a,`expected`])})}function _e(e,t,n){let r=e.grid[0]?.length??0,i=t=>e.grid.join(``).split(t).length-1;e.grid.forEach((e,t)=>{e.length!==r&&n(`every row must be the same length`,[`level`,`grid`,t]),/[^SG.*#]/.test(e)&&n(`only S, G, ., * and # are allowed`,[`level`,`grid`,t])}),i(`S`)!==1&&n(`the grid needs exactly one S`,[`level`,`grid`]),i(`G`)>1&&n(`the grid can have at most one G`,[`level`,`grid`]),t&&i(`G`)!==1&&n(`goal.reach needs a G on the grid`,[`level`,`grid`])}var ve=c(`type`,[ue,de,fe,pe,he]).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n});if(e.requires.includes(e.id)&&n(`a quest cannot require itself`,[`requires`]),e.type!==`predict`){if(e.type===`hero`)_e(e.level,e.goal.reach,n),e.goal.collectAll&&!e.level.grid.some(e=>e.includes(`*`))&&n(`goal.collectAll needs at least one * on the grid`,[`goal`,`collectAll`]);else{if(e.type===`fill`){let t=e.template.split(`
`).filter(e=>e.trim()===T).length;t!==1&&n(`the template needs exactly one line that is only ${T}, found ${t}`,[`template`])}e.grading.tests.some(e=>!e.hidden)||n(`at least one test must be visible, so the student can see what is asked`,[`grading`,`tests`]),e.grading.mode===`method`&&ge(e.grading,n)}}}),ye=d({id:D,order:h().int().min(1),name:_().min(1).max(40),tagline:k,topics:m(_().min(1)).min(1),status:f([`open`,`locked`]),map:D.optional(),giver:d({name:_().min(1).max(40)}).optional(),quests:m(ve).default([])}).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n}),r=new Set;e.quests.forEach((e,t)=>{r.has(e.id)&&n(`duplicate quest id "${e.id}"`,[`quests`,t,`id`]),e.requires.forEach((i,a)=>{i!==e.id&&!r.has(i)&&n(`"${i}" must be a quest listed earlier in this zone`,[`quests`,t,`requires`,a])}),r.add(e.id)}),e.quests.filter(e=>e.boss).length>1&&n(`a zone has at most one boss quest`,[`quests`]),e.status===`open`&&(e.map||n(`an open zone needs a map`,[`map`]),e.giver||n(`an open zone needs a quest-giver`,[`giver`]),e.quests.length===0&&n(`an open zone needs at least one quest`,[`quests`]))}),be=d({zones:m(ye).min(1)}).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n}),r=new Set,i=new Set,a=new Set;e.zones.forEach((e,t)=>{r.has(e.id)&&n(`duplicate zone id "${e.id}"`,[`zones`,t,`id`]),i.has(e.order)&&n(`duplicate zone order ${e.order}`,[`zones`,t,`order`]),r.add(e.id),i.add(e.order),e.quests.forEach((e,r)=>{a.has(e.id)&&n(`quest id "${e.id}" is already used in another zone`,[`zones`,t,`quests`,r,`id`]),a.add(e.id)})})});function xe(e){return g(be,e,`world`)}var Se={zones:[{id:`gate`,order:1,name:`The Gate`,tagline:`Say something, and remember something.`,topics:[`output`,`variables`,`data types`,`operators`,`Scanner input`],status:`locked`},{id:`crossroads`,order:2,name:`The Crossroads`,tagline:`Every path is a condition.`,topics:[`if/else`,`nested conditions`,`logical operators`,`switch`],status:`locked`},{id:`bridge`,order:3,name:`The Bridge`,tagline:`Nobody crosses by counting planks one at a time.`,topics:[`while`,`for`,`do-while`,`nested loops`,`patterns`],status:`open`,map:`bridge`,giver:{name:`Karim Majhi`},quests:[{id:`bridge-count-the-planks`,type:`predict`,title:`Count the Planks`,story:[`So you want to cross. Forty years I have kept this bridge, and every traveller is in a hurry.`,`First show me you can read a loop. My apprentice wrote this to check the planks. Tell me exactly what it prints.`],task:`Trace the code by hand and type exactly what it prints, line by line.`,concepts:[`for`,`loop counter`,`tracing`],xp:20,snippet:`int planks = 0;
for (int i = 1; i <= 10; i += 3) {
    planks++;
    System.out.print(i + " ");
}
System.out.println();
System.out.println("planks = " + planks);`,answer:`1 4 7 10
planks = 4`,explanation:`i starts at 1 and goes up by 3: 1, 4, 7, 10. The next value, 13, fails i <= 10, so the body ran 4 times. print keeps the numbers on one line; the empty println ends it.`,hints:[`Make a table with two columns, i and planks, and fill in one row per trip round the loop.`,`The loop adds 3 each time, not 1. Which values of i are still <= 10?`]},{id:`bridge-first-span`,type:`hero`,title:`The First Span`,story:[`Good. Now the first span. Walk to the far post, and bring me the three lanterns someone left on the planks.`,`I will not tell you how many planks there are. I never counted, and neither should you.`],task:`Walk the hero to the far end of the span and pick up every lantern on the way. Use a loop: you may write hero.step() only once.`,concepts:[`while`,`loop condition`,`if inside a loop`],xp:40,requires:[`bridge-count-the-planks`],level:{grid:[`#########`,`S.*..*.*G`,`#########`],facing:`E`},goal:{reach:!0,collectAll:!0},rules:[{kind:`atMost`,token:`hero.step(`,max:1,message:`Write hero.step() only once and let a loop repeat it.`},{kind:`requires`,anyOf:[`while`,`for`],message:`This span needs a loop. Try while (hero.frontIsClear()) { ... }`}],starter:`public class Main {
    public static void main(String[] args) {
        Hero hero = new Hero();

        // hero.step()          walk one plank forward
        // hero.pick()          pick up a lantern
        // hero.frontIsClear()  true if the next plank is there
        // hero.onItem()        true if a lantern is on this plank

        hero.step();
    }
}
`,hints:[`hero.frontIsClear() is true while there is a plank ahead. That is a loop condition.`,`Inside the loop: step, then check hero.onItem() with an if, and pick when it is true.`]},{id:`bridge-the-toll`,type:`fill`,title:`The Toll`,story:[`There is a toll. Travellers keep trying to pay me nothing, or less than nothing.`,`My toll box asks again and again until it hears a real amount. One line has worn away. Carve it back.`],task:`The program must keep reading numbers until it reads one greater than 0, then print it. Write the one missing line.`,concepts:[`do-while`,`input validation`],xp:30,requires:[`bridge-count-the-planks`],template:`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int toll;
        do {
            toll = sc.nextInt();
__BLANK__
        System.out.println("Toll paid: " + toll);
    }
}
`,grading:{mode:`stdio`,tests:[{name:`Pays at once`,stdin:`7
`,expected:`Toll paid: 7
`},{name:`Tries a negative, then zero`,stdin:`-3
0
5
`,expected:`Toll paid: 5
`},{hidden:!0,stdin:`0
0
-1
12
99
`,expected:`Toll paid: 12
`,hint:`Zero is not a payment either. And once a real amount arrives, stop reading.`}]},hints:[`A do-while ends with a closing brace, the word while, a condition in brackets, and a semicolon.`,`The loop should go round again while the toll is NOT acceptable. Which values are not acceptable?`]},{id:`bridge-rope-counter`,type:`fix`,title:`The Rope Counter`,story:[`Each plank hangs from ropes: plank 1 from one rope, plank 2 from two, and so on. I need the total for n planks.`,`My apprentice wrote this counter. I started it yesterday. It is still running. Find out why, and mend it.`],task:`The program reads n and should print 1 + 2 + ... + n. It has two bugs. Fix both. Run it first to see what happens.`,concepts:[`while`,`infinite loop`,`off-by-one`],xp:40,requires:[`bridge-count-the-planks`],starter:`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int total = 0;
        int i = 1;
        while (i < n) {
            total = total + i;
        }
        System.out.println(total);
    }
}
`,grading:{mode:`stdio`,tests:[{name:`Five planks`,stdin:`5
`,expected:`15
`},{name:`One plank`,stdin:`1
`,expected:`1
`},{hidden:!0,stdin:`100
`,expected:`5050
`,hint:`Is the last plank being counted? Trace n = 3 by hand.`},{hidden:!0,stdin:`0
`,expected:`0
`}]},hints:[`A loop that never ends is a loop whose condition never becomes false. What changes i?`,`With n = 5 the answer should include 5 itself. Look hard at the comparison.`]},{id:`bridge-plank-strength`,type:`write`,title:`Plank Strength`,story:[`Every plank is stamped with a number. The carpenters say a plank is as strong as the sum of its digits. Carpenters say many things.`,`Still, I must log the strengths. The first line is Workshop craft you will learn later. Leave it alone and write the loop inside.`],task:`Complete digitSum so it returns the sum of the digits of n. For example digitSum(1234) is 10. n is never negative.`,concepts:[`while`,`% and /`,`accumulator`],xp:50,requires:[`bridge-the-toll`,`bridge-rope-counter`],starter:`public class Solution {
    public static int digitSum(int n) {
        int sum = 0;
        // n % 10 is the last digit. n / 10 removes it.

        return sum;
    }
}
`,grading:{mode:`method`,method:{name:`digitSum`,params:[{type:`int`,name:`n`}],returns:`int`},tests:[{name:`digitSum(1234)`,args:[1234],expected:10},{name:`digitSum(7)`,args:[7],expected:7},{name:`digitSum(0)`,args:[0],expected:0},{hidden:!0,args:[99999],expected:45},{hidden:!0,args:[1e6],expected:1,hint:`Zeros are digits too. Does your loop stop too early, or too late?`}]},rules:[{kind:`requires`,anyOf:[`while`,`for`,`do`],message:`You do not know how many digits n has, so this needs a loop.`}],hints:[`Take the last digit with n % 10 and add it to sum. Then throw it away with n = n / 10.`,`Keep going while there are digits left: while (n > 0).`]},{id:`bridge-keystone`,type:`write`,boss:!0,title:`The Keystone Arch`,story:[`You have reached the middle, where the old arch fell. The masons left a drawing of how the stones were numbered.`,`Rebuild it for any height I ask and the far gate is yours. Every stone and every gap must be exactly in its place.`],task:`Read n (1 to 9). Print an arch of n rows: row r has n - r spaces, then the numbers 1 up to r, then back down to 1. For n = 3:

  1
 121
12321`,concepts:[`nested loops`,`patterns`,`for`],xp:120,requires:[`bridge-first-span`,`bridge-plank-strength`],starter:`import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();

    }
}
`,grading:{mode:`stdio`,tests:[{name:`n = 3`,stdin:`3
`,expected:`  1
 121
12321
`},{name:`n = 1`,stdin:`1
`,expected:`1
`},{name:`n = 4`,stdin:`4
`,expected:`   1
  121
 12321
1234321
`},{hidden:!0,stdin:`2
`,expected:` 1
121
`,hint:`Check the spaces before each row. Row r needs n - r of them.`},{hidden:!0,stdin:`9
`,expected:`        1
       121
      12321
     1234321
    123454321
   12345654321
  1234567654321
 123456787654321
12345678987654321
`}]},rules:[{kind:`requires`,anyOf:[`for`,`while`],message:`An arch of any height needs loops, one inside another.`}],hints:[`One outer loop for the rows. Inside it, three small loops in a row: spaces, counting up, counting down.`,`Row r: print n - r spaces, then 1 to r, then r - 1 down to 1, then a new line.`,`Use print for the pieces of a row and a single println to end it.`]}]},{id:`library`,order:4,name:`The Library`,tagline:`Words, one character at a time.`,topics:[`strings`],status:`locked`},{id:`storehouse`,order:5,name:`The Storehouse`,tagline:`Shelves, numbered from zero.`,topics:[`arrays`,`searching`,`sorting`],status:`locked`},{id:`workshop`,order:6,name:`The Workshop`,tagline:`Build a tool once, use it everywhere.`,topics:[`methods`,`parameters`,`return`,`scope`],status:`locked`},{id:`mirror-tower`,order:7,name:`The Mirror Tower`,tagline:`A staircase that climbs itself.`,topics:[`recursion`],status:`locked`},{id:`archive`,order:8,name:`The Archive`,tagline:`What is written down outlives the program.`,topics:[`file I/O`],status:`locked`}]},L=null;function Ce(){if(L)return L;let e=xe(Se);if(!e.ok)throw Error(`Quest content is invalid: ${e.error.message}`);return L=e.value,L}function we(e){return[...e.zones].sort((e,t)=>e.order-t.order)}function Te(e,t){for(let n of e.zones){let e=n.quests.find(e=>e.id===t);if(e)return e}return null}function R(e,t){return t.has(e.id)?`done`:e.requires.every(e=>t.has(e))?`open`:`locked`}function Ee(e,t){let n=0;for(let r of e.zones)for(let e of r.quests)t.has(e.id)&&(n+=e.xp);return n}var De=/swiftshader|llvmpipe|softpipe|software|basic render/i;function Oe(e){try{let t=new URLSearchParams(e).get(`quest3d`);if(t===`1`)return`3d`;if(t===`0`)return`2d`}catch{}return`auto`}function ke(e,t,n){if(!t||e===`2d`)return`2d`;if(e===`3d`)return`3d`;let{webgl:r,software:i}=n();return r&&!i?`3d`:`2d`}function Ae(e){try{let t=e.getExtension(`WEBGL_debug_renderer_info`),n=String(t?e.getParameter(t.UNMASKED_RENDERER_WEBGL):e.getParameter(e.RENDERER));return De.test(n)}catch{return!1}}function je(){try{let e=document.createElement(`canvas`).getContext(`webgl2`);if(!e)return{webgl:!1,software:!1};let t=Ae(e);return e.getExtension(`WEBGL_lose_context`)?.loseContext(),{webgl:!0,software:t}}catch{return{webgl:!1,software:!1}}}function Me(e){return{completed:{},zone:e,at:null}}function Ne(e){return new Set(Object.keys(e.completed))}function Pe(e,t,n){return Object.prototype.hasOwnProperty.call(e.completed,t)?e:{...e,completed:{...e.completed,[t]:n}}}function Fe(e,t){return e.at&&e.at.x===t.x&&e.at.y===t.y?e:{...e,at:{x:t.x,y:t.y}}}function Ie(e,t){return e.zone===t?e:{...e,zone:t,at:null}}var Le=1023,Re=/^[a-z0-9]+(?:-[a-z0-9]+)*$/,ze=e=>typeof e==`string`&&e.length<=48&&Re.test(e);function Be(e){let t=Object.entries(e.completed).sort((e,t)=>e[1]-t[1]).slice(0,500);return{v:1,completed:Object.fromEntries(t),zone:e.zone,at:e.at?{x:e.at.x,y:e.at.y}:null}}function Ve(e){if(typeof e!=`object`||!e||Array.isArray(e))return null;let t=e;if(t.v!==1||!ze(t.zone))return null;let n={},r=t.completed;if(typeof r==`object`&&r&&!Array.isArray(r)){for(let[e,t]of Object.entries(r))if(!(!ze(e)||typeof t!=`number`||!Number.isFinite(t)||t<0)){if(Object.keys(n).length>=500)break;n[e]=Math.floor(t)}}let i=null,a=t.at;if(typeof a==`object`&&a){let{x:e,y:t}=a,n=e=>typeof e==`number`&&Number.isInteger(e)&&e>=0&&e<=Le;n(e)&&n(t)&&(i={x:e,y:t})}return{completed:n,zone:t.zone,at:i}}function He(e,t){if(e===t)return!0;if(!e||!t||e.zone!==t.zone||e.at===null!=(t.at===null)||e.at&&t.at&&(e.at.x!==t.at.x||e.at.y!==t.at.y))return!1;let n=Object.keys(e.completed);return n.length===Object.keys(t.completed).length&&n.every(n=>e.completed[n]===t.completed[n])}function Ue(e,t){let n=Object.keys(e?.completed??{}),r=t?.completed??{};return n.length===Object.keys(r).length&&n.every(e=>Object.prototype.hasOwnProperty.call(r,e))}function z(e,t){let n=null;for(let[r,i]of Object.entries(t.completed)){let t=Object.prototype.hasOwnProperty.call(e.completed,r)?e.completed[r]:void 0;t!==void 0&&t<=i||(n??={...e.completed},n[r]=i)}return n?{...e,completed:n}:e}function We(e,t){return Object.keys(t.completed).length!==0&&!He(e,t)}function Ge(){let e=null;return{load:()=>Promise.resolve(e),save:t=>{e=t}}}var Ke=`shohoj_quest_progress_v1`,qe=`shohoj_quest_drafts_v1`;function Je(e,t){try{let n=e.getItem(t);if(n===null)return null;let r=JSON.parse(n);return typeof r==`object`&&r&&!Array.isArray(r)?r:null}catch{return null}}function Ye(e,t,n){try{e.setItem(t,JSON.stringify(n))}catch{}}function Xe(e,t){let n=Je(e,Ke);return!n||n.uid!==t?null:Ve(n.progress)}function Ze(e,t,n){Ye(e,Ke,{uid:t,progress:Be(n)})}function Qe(){let e=new Map;return{get:t=>e.get(t),set:(t,n)=>{e.set(t,n)},flush:()=>void 0}}var $e={set:(e,t)=>setTimeout(e,t),clear:e=>clearTimeout(e)};function et(e){let{storage:t,uid:n}=e,r=e.timers??$e,i=new Map,a=null,o=Je(t,qe),s=o&&o.uid===n?o.drafts:null;if(typeof s==`object`&&s&&!Array.isArray(s))for(let[e,t]of Object.entries(s))typeof t==`string`&&t.length<=2e4&&i.set(e,t);let c=()=>{a=null,Ye(t,qe,{uid:n,drafts:Object.fromEntries(i)})};return{get:e=>i.get(e),set(e,t){for(i.delete(e),t.length<=2e4&&i.set(e,t);i.size>40;){let e=i.keys().next().value;if(e===void 0)break;i.delete(e)}a!==null&&r.clear(a),a=r.set(c,600)},flush(){a!==null&&(r.clear(a),c())}}}var B=e=>typeof e==`object`&&!!e&&!Array.isArray(e),V=e=>typeof e==`number`&&Number.isInteger(e)&&e>0;function tt(e){return e.startsWith(`built`)?`built`:e.startsWith(`barrier`)?`barrier`:`always`}function nt(e,t){let n=e.properties;if(Array.isArray(n)){for(let e of n)if(B(e)&&e.name===t)return typeof e.value==`string`?e.value:null}else if(B(n)&&typeof n[t]==`string`)return n[t];return null}function rt(e){if(!B(e))return y([`The map is not a Tiled JSON object.`]);let t=[],n=e.width,r=e.height,i=e.tilewidth;e.orientation!==`orthogonal`&&t.push(`The map must be orthogonal.`),e.infinite===!0&&t.push(`The map must not be infinite. Turn that off in Map Properties.`),V(n)&&V(r)||t.push(`The map needs a width and a height.`),V(i)&&e.tileheight===i||t.push(`Tiles must be square.`);let a=e.layers;if(Array.isArray(a)||t.push(`The map has no layers.`),t.length>0||!V(n)||!V(r)||!V(i))return y(t);let o=n*r,s=Array(o).fill(!1),c=[],l=new Set,u=null,d=[];for(let e of Array.isArray(a)?a:[]){if(!B(e))continue;let n=typeof e.name==`string`?e.name:``;if(e.type===`objectgroup`){n===`markers`&&Array.isArray(e.objects)&&(u=e.objects),n===`scenery`&&Array.isArray(e.objects)&&(d=e.objects);continue}if(e.type!==`tilelayer`){t.push(`Layer "${n}" is a ${String(e.type)} layer. Use tile layers and one object layer.`);continue}if(n===``||l.has(n)){t.push(`Every tile layer needs its own name. "${n}" is missing or repeated.`);continue}l.add(n);let r=e.data;!Array.isArray(r)||r.length!==o?t.push(`Layer "${n}" is not plain tile data. Export with Tile Layer Format set to CSV and no compression.`):n.startsWith(`blocked`)?r.forEach((e,t)=>{typeof e==`number`&&e!==0&&(s[t]=!0)}):c.push({name:n,role:tt(n),above:n.startsWith(`above`)})}c.length===0&&t.push(`The map has nothing to draw: add a tile layer.`);let f=Array.isArray(e.tilesets)?e.tilesets:[],p=f[0],m=null;if(f.length!==1||!B(p))t.push(`The map must use exactly one tileset.`);else if(typeof p.name!=`string`||typeof p.image!=`string`)t.push(`The tileset must be embedded in the map. In Tiled, use "Embed in Map" on the Tilesets panel.`);else if(p.tilewidth!==i||p.tileheight!==i)t.push(`The tileset's tiles are not the size of the map's squares.`);else{let e=e=>typeof e==`number`&&Number.isInteger(e)&&e>=0?e:0;m={name:p.name,margin:e(p.margin),spacing:e(p.spacing)}}u===null&&t.push(`The map needs an object layer named "markers".`);let h=e=>typeof e==`number`?e:NaN,g=e=>Math.floor(e/i),_=e=>e.x>=0&&e.y>=0&&e.x<n&&e.y<r,b=new Map,x=[],S=null;for(let e of u??[]){if(!B(e))continue;let n=typeof e.name==`string`?e.name:``,r=h(e.x),i=h(e.y),a=Math.max(1,h(e.width)||0),o=Math.max(1,h(e.height)||0),s={x:g(r),y:g(i)},c=g(r+a-1),l=g(i+o-1),u={...s,w:c-s.x+1,h:l-s.y+1};if(!_(s)||!_({x:c,y:l}))t.push(`The "${n}" marker is outside the map.`);else if(n===`spawn`||n===`giver`)b.has(n)&&t.push(`There are two "${n}" markers. Keep one.`),b.set(n,s);else if(n===`exit`)S&&t.push(`There are two "exit" markers. Keep one.`),S=u;else if(n===`gate`){let n=nt(e,`quest`);n?x.push({...u,quest:n}):t.push(`The gate at ${s.x},${s.y} needs a string property "quest" holding a quest id.`)}else t.push(`"${n}" is not a marker the game knows. Use spawn, giver, exit or gate.`)}let C=[];for(let e of d){if(!B(e))continue;let r=typeof e.name==`string`?e.name:``,a=e.gid,o=typeof a==`number`&&Number.isInteger(a)&&a>0,c=h(e.x),l=o?h(e.y)-i:h(e.y),u={x:g(c),y:g(l)};if(!_(u))t.push(`A "${r||`tile`}" in the scenery layer is outside the map.`);else if(o)C.push({kind:`tile`,at:u,gid:a,floats:r===`float`});else if(r===`figure`){let r=nt(e,`look`);if(!r){t.push(`The figure at ${u.x},${u.y} needs a string property "look" naming a person.`);continue}C.push({kind:`figure`,at:u,look:r}),s[u.y*n+u.x]=!0}else t.push(`"${r}" is not scenery the game knows. Use a figure, or a tile object.`)}let w=b.get(`spawn`),T=b.get(`giver`);return u!==null&&(w||t.push(`The markers layer needs a "spawn" point.`),T||t.push(`The markers layer needs a "giver" point.`),S||t.push(`The markers layer needs an "exit" rectangle.`)),t.length>0||!w||!T||!S||!m?y(t):v({width:n,height:r,tileSize:i,tileset:m,layers:c,blocked:s,spawn:w,giver:T,exit:S,gates:x,scenery:C})}var it=(e,t)=>t.x>=e.x&&t.y>=e.y&&t.x<e.x+e.w&&t.y<e.y+e.h;function at(e,t){return e.gates.filter(e=>!t.has(e.quest))}function ot(e,t,n){return at(e,t).find(e=>it(e,n))??null}function st(e,t){let n=e.blocked.map(e=>!e);n[e.giver.y*e.width+e.giver.x]=!1;for(let r of at(e,t))for(let t=r.y;t<r.y+r.h;t+=1)for(let i=r.x;i<r.x+r.w;i+=1)n[t*e.width+i]=!1;return{width:e.width,height:e.height,open:n}}function ct(e,t){return t.x>=0&&t.y>=0&&t.x<e.width&&t.y<e.height&&e.open[t.y*e.width+t.x]===!0}var lt=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];function ut(e,t,n){let r=t.y*e.width+t.x,i=new Map([[r,-1]]),a=[r],o=t=>Math.abs(t%e.width-n.x)+Math.abs(Math.floor(t/e.width)-n.y),s=r,c=o(r);for(let t=0;t<a.length&&c>0;t+=1){let n=a[t],r=n%e.width,l=Math.floor(n/e.width);for(let t of lt){let u={x:r+t.x,y:l+t.y},d=u.y*e.width+u.x;if(!ct(e,u)||i.has(d))continue;i.set(d,n),a.push(d);let f=o(d);f<c&&(s=d,c=f)}}let l=[];for(let t=s;t!==r;t=i.get(t))l.push({x:t%e.width,y:Math.floor(t/e.width)});return l.reverse(),{steps:l,short:c}}var H=r();function dt({world:e,zone:t,completed:n,xp:r,onOpen:i,onClose:a}){let o=(0,S.useRef)(null);(0,S.useEffect)(()=>{o.current?.focus()},[]);let s=new Map(t.quests.map(e=>[e.id,e.title])),c=t.quests.filter(e=>n.has(e.id)).length,l=t.quests.reduce((e,t)=>e+t.xp,0);return(0,H.jsxs)(`div`,{className:`quest-panel`,role:`dialog`,"aria-modal":`true`,"aria-labelledby":`quest-log-title`,children:[(0,H.jsxs)(`div`,{className:`quest-panel-head`,children:[(0,H.jsxs)(`div`,{children:[(0,H.jsxs)(`p`,{className:`quest-kind`,children:[c,` of `,t.quests.length,` quests · `,r,` of `,l,` XP`]}),(0,H.jsxs)(`h2`,{id:`quest-log-title`,ref:o,tabIndex:-1,children:[`Quest log: `,t.name]})]}),(0,H.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:a,children:`Back`})]}),(0,H.jsxs)(`div`,{className:`quest-panel-body`,children:[(0,H.jsx)(`ol`,{className:`quest-log`,children:t.quests.map(e=>{let t=R(e,n),r=e.requires.filter(e=>!n.has(e)).map(e=>s.get(e)??e);return(0,H.jsxs)(`li`,{className:`quest-log-item quest-log-item--${t}`,children:[(0,H.jsxs)(`div`,{className:`quest-log-text`,children:[(0,H.jsxs)(`p`,{className:`quest-log-title`,children:[e.title,e.boss?(0,H.jsx)(`span`,{className:`quest-chip quest-chip--boss`,children:`Boss`}):null]}),(0,H.jsxs)(`p`,{className:`quest-log-meta`,children:[e.concepts.join(` · `),` · `,e.xp,` XP`]}),t===`locked`?(0,H.jsxs)(`p`,{className:`quest-log-meta`,children:[`Needs: `,r.join(`, `)]}):null]}),t===`locked`?(0,H.jsx)(`span`,{className:`quest-log-state`,children:`Locked`}):(0,H.jsxs)(`button`,{type:`button`,className:`quest-button${t===`open`?` quest-button--primary`:``}`,onClick:()=>i(e.id),children:[t===`done`?`Done ✓`:`Start`,(0,H.jsx)(`span`,{className:`quest-sr`,children:t===`done`?`practise ${e.title} again`:e.title})]})]},e.id)})}),(0,H.jsx)(`h3`,{className:`quest-subhead`,children:`The world`}),(0,H.jsx)(`ul`,{className:`quest-zones`,children:we(e).map(e=>(0,H.jsxs)(`li`,{className:`quest-zone${e.id===t.id?` quest-zone--here`:``}`,children:[(0,H.jsxs)(`span`,{className:`quest-zone-name`,children:[e.order,`. `,e.name]}),(0,H.jsx)(`span`,{className:`quest-zone-note`,children:e.id===t.id?`You are here`:e.status===`open`?e.tagline:`Not built yet`})]},e.id))})]})]})}var ft=/^(?:.*[/\\])?([A-Za-z_$][\w$]*\.java):(\d+): (error|warning): (.*)$/,pt=/^(?:\d+ (?:error|warning)s?$|Note: )/,mt=/^\s*\^\s*$/,ht=(e,t)=>{for(let n of e){let e=RegExp(`^\\s*${t}:\\s*(.*)$`).exec(n);if(e?.[1])return e[1].trim()}return null},gt=e=>e?/^(?:variable|method|class)\s+([\w$]+)/.exec(e)?.[1]??null:null,_t=[{when:/^';' expected/,say:()=>`A statement is missing its semicolon. Look at the end of this line, and at the end of the line just above it.`},{when:/^cannot find symbol/,say:(e,t)=>{let n=ht(t,`symbol`),r=gt(n);return n?.startsWith(`variable`)&&r?`Java does not know any variable called ${r}. Check the spelling and the capital letters, and that it was declared (with a type) before this line.`:n?.startsWith(`method`)&&r?`There is no method called ${r} here. Check the spelling and the capital letters: Java treats nextInt and nextint as different names.`:n?.startsWith(`class`)&&r?r===`Scanner`?`Scanner needs an import. Put import java.util.Scanner; on the first line of the file.`:`Java does not know the type ${r}. Check the capital letters: String and System start with a capital.`:`Java does not recognise a name on this line. Check its spelling and capital letters, and that it was declared before it is used.`}},{when:/^incompatible types: possible lossy conversion from (\w+) to (\w+)/,say:e=>`A ${e[1]} value cannot go into a ${e[2]} variable without losing something. Change the variable's type to ${e[1]}, or cast with (${e[2]}) if dropping the extra is what you want.`},{when:/^incompatible types: (.+) cannot be converted to (.+)$/,say:e=>`This line puts a ${e[1]} where a ${e[2]} is needed. Check the type the variable was declared with, and what is on the right of the = sign.`},{when:/^incompatible types: missing return value/,say:()=>`This method must give back a value. Write the value after the word return.`},{when:/^missing return statement/,say:()=>`This method promises to return a value, but there is a way to reach its end without a return. Add a return after the loop or if.`},{when:/^variable (\w+) might not have been initialized/,say:e=>`${e[1]} is used before it has a value. Give it a starting value where it is declared, for example int ${e[1]} = 0;`},{when:/^variable (\w+) is already defined/,say:e=>`${e[1]} was already declared above. Declare a variable once; afterwards use its name without the type.`},{when:/^reached end of file while parsing/,say:()=>`The file ends before every { has its matching }. Count the braces: each opening one needs a closing one.`},{when:/^class, interface, enum, or record expected|^class, interface, or enum expected/,say:()=>`There is code outside the class, usually because of one } too many. Check that the braces are balanced.`},{when:/^'\)' expected|^'\(' expected|^'\)' or ',' expected/,say:()=>`The brackets on this line do not match. Every ( needs a ).`},{when:/^'\{' expected|^'\}' expected/,say:()=>`A brace is missing near this line. Every { needs a }.`},{when:/^not a statement/,say:()=>`This line is not a complete instruction. A lone value or comparison does nothing; did you mean to assign it or print it?`},{when:/^unclosed string literal/,say:()=>`A piece of text is missing its closing ". Text must start and end with a double quote on the same line.`},{when:/^unclosed character literal|^empty character literal/,say:()=>`Single quotes hold exactly one character, like 'a'. For more than one character, use double quotes.`},{when:/^'else' without 'if'/,say:()=>`This else has no if to belong to. Look for a stray semicolon right after the if (...) above, or a brace in the wrong place.`},{when:/^illegal start of (expression|type)/,say:()=>`Java found something it did not expect here, often caused by a missing } or ) on an earlier line.`},{when:/^class (\w+) is public, should be declared in a file named/,say:e=>`Keep the class name the quest started with. Rename ${e[1]} back and try again.`},{when:/^non-static (method|variable) (\S+) cannot be referenced from a static context/,say:e=>`main is static, so it can only use static ${e[1]}s directly. Add the word static to ${(e[2]??``).replace(/\(.*$/,``)}.`},{when:/^unreachable statement/,say:()=>`Java can never reach this line. It comes after a return or break, or after a loop that never ends.`},{when:/^bad operand types for binary operator '(.+)'/,say:e=>`${e[1]} cannot be used between these two types. Compare numbers with numbers, and join conditions with && or ||.`},{when:/^incomparable types|cannot be compared/,say:()=>`These two values are of different kinds and cannot be compared. For text, use .equals(...) rather than ==.`},{when:/^method (\w+) in class \w+ cannot be applied to given types/,say:e=>`${e[1]} was called with the wrong number or kind of values. Compare the call with how the method is declared.`},{when:/^<identifier> expected/,say:()=>`Java expected a name here. A statement may be sitting outside any method, or a type is missing before a variable name.`},{when:/^array required, but (\w+) found/,say:e=>`Square brackets only work on arrays, and this is a ${e[1]}.`},{when:/^break outside switch or loop|^continue outside of loop/,say:()=>`break and continue only make sense inside a loop. Check where this loop's braces end.`}],vt=`Read the message against this line and the one above it. Most compiler errors are a missing symbol or a misspelt name.`;function yt(e,t){for(let n of _t){let r=n.when.exec(e);if(r)return n.say(r,t)}return vt}function bt(e,t){let n=e.replace(/\r\n?/g,`
`).split(`
`),r=[],i=0;for(;i<n.length;){let e=ft.exec(n[i]??``);if(!e){i+=1;continue}let a=[];for(i+=1;i<n.length&&!ft.test(n[i]??``)&&!pt.test((n[i]??``).trim());)a.push(n[i]??``),i+=1;let o=a.findIndex(e=>mt.test(e)),s=o===-1?null:(a[o]??``).indexOf(`^`)+1,c=o>1?a.slice(0,o-1):[],l=(o===-1?a:a.slice(o+1)).filter(e=>e.trim()),u=[e[4]??``,...c.map(e=>e.trim())].join(` `).trim(),d=e[1]??``;r.push({file:d,line:Number(e[2]),column:s,severity:e[3]===`warning`?`warning`:`error`,message:u,details:l,hint:yt(u,l),inStudentFile:d===t})}return r}var xt={ArithmeticException:()=>`The program divided a whole number by zero. Check the value on the right of / or % before dividing.`,ArrayIndexOutOfBoundsException:()=>`The program used a position that is not in the array. Positions run from 0 to length - 1, so a loop that reaches length goes one too far.`,StringIndexOutOfBoundsException:()=>`The program asked for a character position that is not in the text. Positions run from 0 to length() - 1.`,NullPointerException:()=>`The program used a variable that holds nothing yet (null). Give it a value with new, or an assignment, before using it.`,InputMismatchException:()=>`The program read a different kind of input from what was there, for example nextInt() when the next thing is a word or a decimal.`,NoSuchElementException:()=>`The program asked for more input than there was. Check how many times the loop reads: it may be reading once too often.`,NumberFormatException:()=>`The program tried to turn text into a number, but the text is not a number.`,StackOverflowError:()=>`A method kept calling itself and never stopped. Check that it has a case where it does not call itself.`,OutOfMemoryError:()=>`The program used up all the memory, usually by adding to something inside a loop that never ends.`,NegativeArraySizeException:()=>`An array was created with a negative size. Check the number inside the [ ].`,ClassCastException:()=>`A value was treated as a type it is not.`};function St(e){let[t=``,n=`0`,...r]=e.split(`|`),i=t.slice(t.lastIndexOf(`.`)+1)||`Exception`,a=r.join(`|`),o=Number(n)>0?Number(n):null,s=xt[i];return{name:i,line:o,message:a,hint:s?s(a):`The program stopped with an error while running. The line shown is where it happened.`}}var Ct={NoMainClass:`The class must be called Main. Keep the first line the quest started with.`,NoMainMethod:`Java could not find public static void main(String[] args). Keep that line exactly as it was.`,MainNotStatic:`main must be static: public static void main(String[] args).`,NoClass:`The class has been renamed. Keep the class name the quest started with.`,NoMethod:`The method the tests call is missing or its first line has changed. Keep the name, the parameters and the return type the quest started with.`,NoConstructor:`The class needs a constructor that takes no values, or make the method static.`};function wt(e){return Ct[e]??`The tests could not start your program. Check that its first lines are unchanged.`}function Tt(e){let t=e.replace(/\r\n?/g,`
`).split(`
`).map(e=>e.replace(/[ \t]+$/,``));for(;t.length>0&&t[t.length-1]===``;)t.pop();return t}function Et(e,t){let n=Tt(e),r=Tt(t),i=Math.max(n.length,r.length);for(let e=0;e<i;e+=1){let t=n[e]??null,i=r[e]??null;if(t!==i)return{pass:!1,diff:{line:e+1,expected:t,actual:i}}}return{pass:!0}}function Dt(e){return e.replace(/^ +/,e=>`·`.repeat(e.length))}var Ot=[`N`,`E`,`S`,`W`],kt=[0,1,0,-1],At=[-1,0,1,0],jt={S:`step`,B:`blocked`,L:`turnLeft`,R:`turnRight`,P:`pick`,p:`pickNothing`,X:`tired`};function Mt(e){for(let t=0;t<e.grid.length;t+=1){let n=(e.grid[t]??``).indexOf(`S`);if(n>=0)return{x:n,y:t,facing:e.facing}}return{x:0,y:0,facing:e.facing}}function Nt(e,t){let n=t.split(`|`);if(n.length!==6)return null;let r=n[0]??``,i=n[5]??``,a=Mt(e),{x:o,y:s}=a,c=Ot.indexOf(a.facing),l=0,u=[];for(let e of r){let t=jt[e];if(!t)return null;t===`step`?(o+=kt[c]??0,s+=At[c]??0):t===`turnLeft`?c=(c+3)%4:t===`turnRight`?c=(c+1)%4:t===`pick`&&(l+=1),u.push({event:t,x:o,y:s,facing:Ot[c]??`N`,picked:l})}let d=i===`blocked`||i===`tired`||i===`dizzy`?i:null,f=e.grid.join(``).split(`*`).length-1;return{start:a,frames:u,stop:d,reachedGoal:(e.grid[s]??``).charAt(o)===`G`,picked:l,totalItems:f}}function Pt(e,t){if(t.stop===`blocked`)return{passed:!1,message:`The hero walked into something that cannot be crossed.`};if(t.stop===`tired`)return{passed:!1,message:`The hero is worn out after ${e.maxActions} actions. A loop may be running longer than it should.`};if(t.stop===`dizzy`)return{passed:!1,message:`The hero kept looking around and never moved. Something inside the loop has to change what the loop is checking.`};if(e.goal.reach&&!t.reachedGoal)return{passed:!1,message:`The code finished, but the hero is not at the goal yet.`};if(e.goal.collectAll&&t.picked<t.totalItems){let e=t.totalItems-t.picked;return{passed:!1,message:`The hero reached the end but left ${e} item${e===1?``:`s`} behind.`}}return{passed:!0,message:`The hero made it.`}}function Ft(e,t){switch(e){case`\\`:return`\\\\`;case`
`:return`\\n`;case`\r`:return`\\r`;case`	`:return`\\t`;default:{if(e===t)return`\\${t}`;let n=e.charCodeAt(0);return n<32||n>126?`\\u${n.toString(16).padStart(4,`0`)}`:e}}}function U(e){let t=`"`;for(let n=0;n<e.length;n+=1)t+=Ft(e.charAt(n),`"`);return`${t}"`}function It(e,t){switch(e){case`int`:return String(t);case`long`:return`${String(t)}L`;case`double`:{let e=String(t);return/[.eE]/.test(e)?e:`${e}.0`}case`boolean`:return t===!0?`true`:`false`;case`char`:return`'${Ft(String(t),`'`)}'`;default:return U(String(t))}}function Lt(e,t){if(Array.isArray(t)){let n=e.slice(0,-2);return`new ${e}{${t.map(e=>It(n,e)).join(`, `)}}`}return It(e,t)}function Rt(e){return`${e}.class`}function zt(e,t){return e===`String`?`"${String(t)}"`:e===`char`?`'${String(t)}'`:String(t)}function Bt(e,t){if(Array.isArray(t)){let n=e.slice(0,-2);return`[${t.map(e=>zt(n,e)).join(`, `)}]`}return zt(e,t)}function Vt(e,t){if(t===`null`)return`null`;if(e.endsWith(`[]`)){let n=e.slice(0,-2);return`[${Ht(t).map(e=>zt(n,e)).join(`, `)}]`}return zt(e,t)}function Ht(e){let t=e.startsWith(`[`)&&e.endsWith(`]`)?e.slice(1,-1):e;return t===``?[]:t.split(``)}function Ut(e,t,n){if(e===`double`){let e=Number(n),r=Number(t);return Number.isFinite(e)?Math.abs(e-r)<=1e-6*Math.max(1,Math.abs(r)):!1}return String(t)===n}function Wt(e,t,n){if(n===`null`)return!1;if(Array.isArray(t)){let r=e.slice(0,-2),i=Ht(n);return i.length===t.length&&t.every((e,t)=>Ut(r,e,i[t]??``))}return Ut(e,t,n)}var W=(e,t,n)=>({index:e.index,name:e.name,hidden:e.hidden,outcome:t,message:n,input:null,expected:null,actual:null,diff:null,problem:null,hint:t===`pass`?null:e.hint}),Gt=e=>{let t=e/1e3;return`${Number.isInteger(t)?t:t.toFixed(1)} second${t===1?``:`s`}`};function Kt(e){return e.line===null?`${e.name}.`:`${e.name} at line ${e.line}.`}function qt(e,t){if(e.type===`hero`)return{input:null,expected:null};let n=e.grading;if(n.mode===`stdio`){let e=n.tests[t];return{input:e?.stdin??null,expected:e?.expected??null}}let r=n.tests[t];if(!r)return{input:null,expected:null};let{name:i,params:a,returns:o}=n.method,s=a.map((e,t)=>Bt(e.type,r.args[t]??0)).join(`, `),c=o!==`void`&&r.expected!==void 0?Bt(o,r.expected):r.expectedStdout??null;return{input:`${i}(${s})`,expected:c}}function Jt(e,t,n){if(e.type===`hero`){let r=Nt(e.level,n.extra);if(!r)return{verdict:W(t,`error`,`The run left nothing to replay.`),hero:null};let i=Pt(e,r);return{verdict:W(t,i.passed?`pass`:`fail`,i.passed?null:i.message),hero:r}}let r=t.hidden?{input:null,expected:null}:qt(e,t.index),i=e.grading;if(i.mode===`stdio`){let e=i.tests[t.index],a=Et(e?.expected??``,n.out);return a.pass?{verdict:{...W(t,`pass`,null),...r},hero:null}:{verdict:{...W(t,`fail`,t.hidden?`A hidden test printed the wrong output.`:`Line ${a.diff.line} of the output is different.`),...r,actual:t.hidden?null:n.out,diff:t.hidden?null:a.diff},hero:null}}let a=i.tests[t.index],{returns:o}=i.method,s=o===`void`||a?.expected===void 0||Wt(o,a.expected,n.extra),c=a?.expectedStdout===void 0?{pass:!0}:Et(a.expectedStdout,n.out);if(s&&c.pass)return{verdict:{...W(t,`pass`,null),...r},hero:null};let l=`A hidden test got the wrong answer.`,u=null,d=null;return t.hidden||(s?c.pass||(u=n.out,d=c.diff,l=`Line ${c.diff.line} of what it printed is different.`):(u=Vt(o,n.extra),l=`Returned ${u}, expected ${r.expected??`something else`}.`)),{verdict:{...W(t,`fail`,l),...r,actual:u,diff:d},hero:null}}function Yt(e,t,n,r){let i=new Map(n.map(e=>[e.index,e])),a=null,o=!1,s=t.tests.map(n=>{let s=i.get(n.index);if(!s)return o||r.kind===`done`?W(n,`notRun`,`Not run.`):(o=!0,r.kind===`timeout`?W(n,`timeout`,`Stopped after ${Gt(t.timeLimitMs)}. A loop is probably never ending: check that something inside it changes its condition.`):W(n,`error`,`The program ended before the tests finished. System.exit() stops everything, including the tests.`));if(s.status===`SETUP`)return W(n,`error`,wt(s.detail));if(s.status===`OLE`)return W(n,`error`,`The program printed far more than any answer needs. A loop that prints is probably never ending.`);if(s.status===`EXC`){let t=St(s.detail);e.type===`hero`&&(a=Nt(e.level,s.extra));let r=n.hidden?{input:null,expected:null}:qt(e,n.index);return{...W(n,`error`,Kt(t)),...r,problem:t}}let c=Jt(e,n,s);return c.hero&&(a=c.hero),c.verdict}),c=s.filter(e=>e.outcome===`pass`).length,l=c===s.length,u=e.type===`hero`?s[0]?.message??`The hero made it.`:l?`All ${s.length} tests passed.`:`${c} of ${s.length} tests passed.`;return{kind:`tests`,passed:l,tests:s,hero:a,summary:u}}function Xt(e,t){let n=Et(e.answer,t);return{kind:`predict`,passed:n.pass,wrongLine:n.pass?null:n.diff.line}}function Zt(e){return{kind:`rules`,passed:!1,failures:e}}function Qt(e,t){return{kind:`compile`,passed:!1,diagnostics:e,raw:t}}function $t(e){let t=``,n=0,r=e.length,i=e=>e===`
`?`
`:` `;for(;n<r;){let a=e.charAt(n),o=e.charAt(n+1);if(a===`/`&&o===`/`)for(;n<r&&e.charAt(n)!==`
`;)t+=` `,n+=1;else if(a===`/`&&o===`*`){let a=e.indexOf(`*/`,n+2),o=a===-1?r:a+2;for(;n<o;n+=1)t+=i(e.charAt(n))}else if(a===`"`||a===`'`){for(t+=a,n+=1;n<r&&e.charAt(n)!==a&&e.charAt(n)!==`
`;)e.charAt(n)===`\\`&&n+1<r&&e.charAt(n+1)!==`
`?(t+=`  `,n+=2):(t+=` `,n+=1);n<r&&e.charAt(n)===a&&(t+=a,n+=1)}else t+=a,n+=1}return t}var en=e=>/^\w+$/.test(e),tn=e=>e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);function nn(e,t){if(en(t))return e.match(RegExp(`\\b${tn(t)}\\b`,`g`))?.length??0;let n=e.replace(/\s+/g,``),r=t.replace(/\s+/g,``);return r?n.split(r).length-1:0}function rn(e,t){let n=$t(e),r=[];for(let e of t)e.kind===`requires`?e.anyOf.some(e=>nn(n,e)>0)||r.push(e.message):nn(n,e.token)>e.max&&r.push(e.message);return r}function an(e,t){let n=e.split(`
`),r=n.findIndex(e=>e.trim()===T);if(r===-1)return{source:e,firstLine:1,lineCount:0};let i=``;for(let e=r-1;e>=0;--e){let t=n[e]??``;if(t.trim()){i=/^\s*/.exec(t)?.[0]??``;break}}let a=t.replace(/\r\n?/g,`
`).split(`
`).map(e=>e.trim()).filter(e=>e.length>0),o=a.length>0?a.map(e=>i+e):[``];return n.splice(r,1,...o),{source:n.join(`
`),firstLine:r+1,lineCount:o.length}}var on=e=>`QuestHarness.at(${e}); `,sn=/^(?:else\b|catch\b|finally\b|case\b|default\b|public\b|private\b|protected\b|static\b|abstract\b|class\b|interface\b|enum\b|@|(?:this|super)\s*\(|[^\w(+-]|[+-](?![+-]))/;function cn(e){let t=e.split(`
`),n=$t(e).split(`
`),r=[],i=0,a=``,o=``;return t.map((e,t)=>{let s=n[t]??``,c=s.trim(),l=a===`;`||a===`{`||a===`}`||a===`:`&&/^(?:case|default)\b/.test(o),u=r.length>=2&&r[r.length-1]===`code`,d=c!==``&&l&&u&&i===0&&!sn.test(c);for(let e=0;e<s.length;e+=1){let t=s.charAt(e);t===`{`?r.push(/[=,{\]]/.test(a)?`data`:`code`):t===`}`?r.pop():t===`(`?i+=1:t===`)`&&(i=Math.max(0,i-1)),t.trim()!==``&&(a=t)}if(c!==``&&(o=c),!d)return e;let f=s.length-s.trimStart().length;return e.slice(0,f)+on(t+1)+e.slice(f)}).join(`
`)}var ln=`/str/`,un=`/files/quest/`,dn=`QuestHarness`,fn={N:0,E:1,S:2,W:3};function pn(e,t=200){let n=e.grid.map(e=>U(e)).join(`, `);return String.raw`public class Hero {
    private static final String[] GRID = { ${n} };
    private static final int START_DIR = ${fn[e.facing]};
    private static final int MAX_ACTIONS = ${t};
    private static final int MAX_LOOKS = 100000;
    private static final int[] DX = { 0, 1, 0, -1 };
    private static final int[] DY = { -1, 0, 1, 0 };

    private static StringBuilder trace = new StringBuilder();
    private static boolean[][] taken = new boolean[GRID.length][GRID[0].length()];
    private static int x, y, dir, picked, actions, looks;
    private static String stop = "";

    static void reset() {
        trace = new StringBuilder();
        taken = new boolean[GRID.length][GRID[0].length()];
        picked = 0;
        actions = 0;
        looks = 0;
        stop = "";
        dir = START_DIR;
        for (int r = 0; r < GRID.length; r++) {
            int c = GRID[r].indexOf('S');
            if (c >= 0) {
                x = c;
                y = r;
            }
        }
    }

    static String report() {
        return trace + "|" + x + "|" + y + "|" + dir + "|" + picked + "|" + stop;
    }

    private static char at(int cx, int cy) {
        if (cy < 0 || cy >= GRID.length || cx < 0 || cx >= GRID[cy].length()) return '#';
        return GRID[cy].charAt(cx);
    }

    private static void act() {
        if (!stop.isEmpty()) throw new HeroStop(stop);
        actions++;
        if (actions > MAX_ACTIONS) {
            stop = "tired";
            trace.append('X');
            throw new HeroStop(stop);
        }
    }

    private static void look() {
        if (!stop.isEmpty()) throw new HeroStop(stop);
        looks++;
        if (looks > MAX_LOOKS) {
            stop = "dizzy";
            throw new HeroStop(stop);
        }
    }

    public Hero() {}

    public void step() {
        act();
        if (at(x + DX[dir], y + DY[dir]) == '#') {
            stop = "blocked";
            trace.append('B');
            throw new HeroStop(stop);
        }
        x += DX[dir];
        y += DY[dir];
        trace.append('S');
    }

    public void turnLeft() {
        act();
        dir = (dir + 3) % 4;
        trace.append('L');
    }

    public void turnRight() {
        act();
        dir = (dir + 1) % 4;
        trace.append('R');
    }

    public void pick() {
        act();
        if (at(x, y) == '*' && !taken[y][x]) {
            taken[y][x] = true;
            picked++;
            trace.append('P');
        } else {
            trace.append('p');
        }
    }

    public boolean frontIsClear() {
        look();
        return at(x + DX[dir], y + DY[dir]) != '#';
    }

    public boolean onItem() {
        look();
        return at(x, y) == '*' && !taken[y][x];
    }

    public boolean atGoal() {
        look();
        return at(x, y) == 'G';
    }
}

class HeroStop extends RuntimeException {
    HeroStop(String why) {
        super(why);
    }
}
`}function mn(e,t){let{name:n,params:r,returns:i}=e.method,a=r.map(e=>Rt(e.type)).join(`, `),o=r.map((e,n)=>Lt(e.type,t[n]??0)).join(`, `);return`call(l, ${U(e.className)}, ${U(n)}, new Class<?>[] { ${a} }, new Object[] { ${o} }, ${i===`void`})`}function hn(e){if(e.type===`hero`)return[`test(0, "", l -> hero(l));`];let t=e.grading;return t.mode===`stdio`?t.tests.map((e,t)=>`test(${t}, ${U(e.stdin)}, l -> runMain(l));`):t.tests.map((e,n)=>`test(${n}, "", l -> ${mn(t,e.args)});`)}function gn(e,t){let n=e.type===`hero`,r=hn(e).map(e=>`        ${e}`).join(`
`),i=n?String.raw`
    static String hero(ClassLoader loader) throws Throwable {
        Hero.reset();
        try {
            runMain(loader);
        } catch (InvocationTargetException e) {
            if (e.getCause() == null || !e.getCause().getClass().getName().equals("HeroStop")) throw e;
        } finally {
            partial = Hero.report();
        }
        return partial;
    }
`:``;return String.raw`import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.PrintStream;
import java.lang.reflect.Array;
import java.lang.reflect.Constructor;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public class QuestHarness {
    static final String TAG = "\001Q${t}";
    static final String DIR = ${U(un)};
    static final int OUT_LIMIT = 65536;
    static final PrintStream REAL = System.out;
    static final PrintStream REAL_ERR = System.err;
    static String partial = "";
    static int line = 0;

    public static void at(int n) {
        line = n;
    }

    interface Body {
        String run(ClassLoader loader) throws Throwable;
    }

    static class Setup extends Exception {
        Setup(String what) {
            super(what);
        }
    }

    static class OutputLimit extends RuntimeException {
        OutputLimit() {
            super("output limit");
        }
    }

    static class Capped extends ByteArrayOutputStream {
        @Override
        public synchronized void write(int b) {
            if (count >= OUT_LIMIT) throw new OutputLimit();
            super.write(b);
        }

        @Override
        public synchronized void write(byte[] b, int off, int len) {
            if (count + len > OUT_LIMIT) throw new OutputLimit();
            super.write(b, off, len);
        }
    }

    static boolean isStudent(String name) {
        int nested = name.indexOf('$');
        String outer = nested < 0 ? name : name.substring(0, nested);
        return outer.indexOf('.') < 0
            && !outer.equals("QuestHarness")
            && !outer.equals("Hero")
            && !outer.equals("HeroStop");
    }

    static class Fresh extends ClassLoader {
        Fresh() {
            super(QuestHarness.class.getClassLoader());
        }

        @Override
        protected Class<?> loadClass(String name, boolean resolve) throws ClassNotFoundException {
            synchronized (getClassLoadingLock(name)) {
                Class<?> c = findLoadedClass(name);
                if (c == null && isStudent(name)) {
                    byte[] bytes = read(name);
                    if (bytes != null) c = defineClass(name, bytes, 0, bytes.length);
                }
                if (c == null) return super.loadClass(name, resolve);
                if (resolve) resolveClass(c);
                return c;
            }
        }

        static byte[] read(String name) {
            File file = new File(DIR + name + ".class");
            if (!file.isFile()) return null;
            try (InputStream in = new FileInputStream(file)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = in.read(chunk)) > 0) out.write(chunk, 0, n);
                return out.toByteArray();
            } catch (Exception e) {
                return null;
            }
        }
    }

    static String b64(String s) {
        if (s == null || s.isEmpty()) return "-";
        return Base64.getEncoder().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }

    static String describe(Throwable t) {
        String message = t.getMessage();
        return t.getClass().getName() + "|" + line + "|" + (message == null ? "" : message);
    }

    static String fmt(Object value) {
        if (value == null) return "null";
        if (value.getClass().isArray()) {
            StringBuilder sb = new StringBuilder("[");
            int n = Array.getLength(value);
            for (int k = 0; k < n; k++) {
                if (k > 0) sb.append('\037');
                sb.append(String.valueOf(Array.get(value, k)));
            }
            return sb.append(']').toString();
        }
        return String.valueOf(value);
    }

    static String runMain(ClassLoader loader) throws Throwable {
        Class<?> c;
        try {
            c = loader.loadClass("Main");
        } catch (ClassNotFoundException e) {
            throw new Setup("NoMainClass");
        }
        Method m;
        try {
            m = c.getDeclaredMethod("main", String[].class);
        } catch (NoSuchMethodException e) {
            throw new Setup("NoMainMethod");
        }
        if (!Modifier.isStatic(m.getModifiers())) throw new Setup("MainNotStatic");
        m.setAccessible(true);
        m.invoke(null, (Object) new String[0]);
        return "";
    }

    static String call(ClassLoader loader, String cls, String name, Class<?>[] types, Object[] args, boolean isVoid)
        throws Throwable {
        Class<?> c;
        try {
            c = loader.loadClass(cls);
        } catch (ClassNotFoundException e) {
            throw new Setup("NoClass");
        }
        Method m;
        try {
            m = c.getDeclaredMethod(name, types);
        } catch (NoSuchMethodException e) {
            throw new Setup("NoMethod");
        }
        m.setAccessible(true);
        Object target = null;
        if (!Modifier.isStatic(m.getModifiers())) {
            Constructor<?> k;
            try {
                k = c.getDeclaredConstructor();
            } catch (NoSuchMethodException e) {
                throw new Setup("NoConstructor");
            }
            k.setAccessible(true);
            target = k.newInstance();
        }
        Object result = m.invoke(target, args);
        if (isVoid) return "";
        if (m.getReturnType() == void.class) throw new Setup("NoMethod");
        return fmt(result);
    }
${i}
    static void test(int index, String input, Body body) {
        REAL.println(TAG + " BEGIN " + index);
        REAL.flush();
        partial = "";
        line = 0;
        String status = "OK";
        String detail = "";
        String extra = "";
        String printed = "";
        InputStream oldIn = System.in;
        Capped captured = new Capped();
        try {
            PrintStream out = new PrintStream(captured, true, "UTF-8");
            System.setIn(new ByteArrayInputStream(input.getBytes(StandardCharsets.UTF_8)));
            System.setOut(out);
            System.setErr(new PrintStream(new Capped(), true, "UTF-8"));
            try {
                extra = body.run(new Fresh());
            } catch (InvocationTargetException e) {
                throw e.getCause() == null ? e : e.getCause();
            } finally {
                out.flush();
            }
        } catch (Setup e) {
            status = "SETUP";
            detail = e.getMessage();
        } catch (OutputLimit e) {
            status = "OLE";
        } catch (Throwable t) {
            status = "EXC";
            detail = describe(t);
        } finally {
            System.setOut(REAL);
            System.setErr(REAL_ERR);
            System.setIn(oldIn);
        }
        try {
            printed = captured.toString("UTF-8");
        } catch (Exception e) {
            printed = "";
        }
        if (extra.isEmpty()) extra = partial;
        REAL.println(TAG + " END " + index + " " + status + " " + b64(printed) + " " + b64(detail) + " " + b64(extra));
        REAL.flush();
    }

    public static void main(String[] argv) {
${r}
        REAL.println(TAG + " DONE");
        REAL.flush();
    }
}
`}function _n(e){return e.type===`hero`?[{index:0,name:`Run`,hidden:!1,hint:null}]:e.grading.tests.map((e,t)=>({index:t,name:e.name??`Test ${t+1}`,hidden:e.hidden,hint:e.hint??null}))}function vn(e,t,n){let r=e.type===`fill`?an(e.template,t):null,i=r?r.source:t,a=rn(r?t:i,e.rules);if(a.length>0)return{kind:`rules`,failures:a};let o=`Main.java`;e.type!==`hero`&&e.grading.mode===`method`&&(o=`${e.grading.className}.java`);let s=[];return e.type===`hero`&&s.push({name:`Hero.java`,content:pn(e.level,e.maxActions)}),s.push({name:`${dn}.java`,content:gn(e,n)}),{kind:`java`,files:[{name:o,content:cn(i)},...s],plainFiles:[{name:o,content:i},...s],studentFile:o,nonce:n,tests:_n(e),timeLimitMs:e.timeLimitMs,fill:r}}function yn(e){return[`-d`,un,`-cp`,ln,`-proc:none`,`-nowarn`,`-encoding`,`UTF-8`,...e.map(e=>ln+e.name)]}function bn(){let e=new Uint8Array(8);return globalThis.crypto.getRandomValues(e),Array.from(e,e=>e.toString(16).padStart(2,`0`)).join(``)}async function xn(e,t,n,r={}){if(t.type===`predict`)return Xt(t,n);let i=vn(t,n,bn());if(i.kind===`rules`)return Zt(i.failures);let a=await e.run(i,r);return a.kind===`engineError`?{kind:`engine`,passed:!1,message:a.message}:a.kind===`compileError`?Qt(bt(a.output,i.studentFile),a.output):Yt(t,i,a.results,a.ending)}var Sn=`/Shohoj/app/assets/roguelikeChar_transparent-DP2joJTf.png`,G=`/Shohoj/app/assets/roguelikeSheet_transparent-COc4qv4E.png`,K=(e,t)=>({column:e,row:t}),Cn={hero:[K(0,1),K(3,0),K(4,0),K(7,5),K(23,4)],boatman:[K(1,2),K(3,3),K(7,4),K(21,8),K(28,8)],seller:[K(1,1),K(3,2),K(6,8),K(22,6)],fisher:[K(0,2),K(3,3),K(8,9),K(29,8)],farmer:[K(0,2),K(3,0),K(4,1),K(10,10),K(23,5),K(28,8)],villager:[K(0,1),K(3,5),K(6,0),K(24,5)]},wn=e=>Object.prototype.hasOwnProperty.call(Cn,e),Tn={columns:57,rows:31,width:968,height:526},En={columns:54,rows:12,width:918,height:203},Dn=(e,t)=>t.row*e.columns+t.column,q={floor:{column:8,row:2},wall:{column:0,row:0},item:{column:17,row:7},goal:{column:20,row:0}},J=2,Y=16*J,On=230;function kn(e,t,n){return{backgroundImage:`url(${e})`,backgroundSize:`${t.width*J}px ${t.height*J}px`,backgroundPosition:`-${n.column*17*J}px -${n.row*17*J}px`}}function An(e){let t=[...e].reverse(),{width:n,height:r}=En;return{backgroundImage:t.map(()=>`url(${Sn})`).join(`, `),backgroundSize:t.map(()=>`${n*J}px ${r*J}px`).join(`, `),backgroundPosition:t.map(e=>`-${e.column*17*J}px -${e.row*17*J}px`).join(`, `),backgroundRepeat:`no-repeat`}}var jn=(e,t)=>({left:e*Y,top:t*Y}),Mn={N:`up`,E:`right`,S:`down`,W:`left`};function Nn({level:e,run:t}){let[n,r]=(0,S.useState)(0),[i,a]=(0,S.useState)(0);(0,S.useEffect)(()=>{if(!t)return;let e=t.frames.length,n=typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,i=n?e:0,a=window.setTimeout(()=>r(i),0);if(n||e===0)return()=>window.clearTimeout(a);let o=window.setInterval(()=>{i+=1,r(i),i>=e&&window.clearInterval(o)},On);return()=>{window.clearTimeout(a),window.clearInterval(o)}},[t,i]);let o=e.grid,s=o[0]?.length??0,c=t?t.frames.slice(0,Math.min(n,t.frames.length)):[],l=c[c.length-1],u=t?.start??Mt(e),d=l??u,f=new Set;for(let e of c)e.event===`pick`&&f.add(`${e.x},${e.y}`);let p=o.join(``).split(`*`).length-1,m=t!==null&&t.frames.length>0&&n>=t.frames.length,h=l?.event===`blocked`;return(0,H.jsxs)(`div`,{className:`quest-board-wrap`,children:[(0,H.jsxs)(`div`,{className:`quest-board`,role:`img`,"aria-label":`The hero's board, ${s} squares by ${o.length}. The hero is at column ${d.x+1}, row ${d.y+1}, facing ${Mn[d.facing]}, holding ${f.size} of ${p}.`,style:{width:s*Y,height:o.length*Y},children:[o.flatMap((e,t)=>[...e].map((e,n)=>(0,H.jsx)(`span`,{className:`quest-board-tile`,style:{...jn(n,t),...kn(G,Tn,e===`#`?q.wall:q.floor)}},`${n},${t}`))),o.flatMap((e,t)=>[...e].flatMap((e,n)=>e===`G`?[(0,H.jsx)(`span`,{className:`quest-board-tile`,style:{...jn(n,t),...kn(G,Tn,q.goal)}},`goal ${n},${t}`)]:e===`*`&&!f.has(`${n},${t}`)?[(0,H.jsx)(`span`,{className:`quest-board-tile`,style:{...jn(n,t),...kn(G,Tn,q.item)}},`item ${n},${t}`)]:[])),(0,H.jsx)(`span`,{className:`quest-board-hero${h?` quest-board-hero--bumped`:``}`,"data-facing":d.facing,style:{transform:`translate(${d.x*Y}px, ${d.y*Y}px)`,...An(Cn.hero)}})]}),(0,H.jsxs)(`p`,{className:`quest-board-caption`,children:[`Holding `,f.size,` of `,p,m?(0,H.jsxs)(H.Fragment,{children:[` · `,(0,H.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:()=>a(e=>e+1),children:`Watch again`})]}):null]})]})}var Pn={pass:`✓`,fail:`✗`,error:`✗`,timeout:`⏱`,notRun:`·`},Fn={pass:`passed`,fail:`wrong answer`,error:`stopped with an error`,timeout:`ran out of time`,notRun:`not run`};function In({label:e,text:t}){return(0,H.jsxs)(`div`,{className:`quest-io`,children:[(0,H.jsx)(`span`,{className:`quest-io-label`,children:e}),(0,H.jsx)(`pre`,{className:`quest-io-text`,tabIndex:0,"aria-label":e,children:t===``?`(nothing)`:t})]})}function Ln({text:e}){return e===null?(0,H.jsx)(`em`,{children:`no line`}):(0,H.jsx)(`code`,{children:Dt(e)})}function Rn({diagnostic:e}){return(0,H.jsxs)(`li`,{className:`quest-problem`,children:[(0,H.jsx)(`p`,{className:`quest-problem-where`,children:e.inStudentFile?`Line ${e.line}`:`In the code around yours`}),(0,H.jsx)(`p`,{className:`quest-problem-hint`,children:e.hint}),(0,H.jsx)(`pre`,{className:`quest-problem-raw`,children:[e.message,...e.details].join(`
`)})]})}function zn({test:e,bare:t=!1}){let n=e.outcome!==`pass`&&e.outcome!==`notRun`;return(0,H.jsxs)(`li`,{className:`quest-test quest-test--${e.outcome}`,children:[t?null:(0,H.jsxs)(`p`,{className:`quest-test-head`,children:[(0,H.jsx)(`span`,{className:`quest-test-mark`,"aria-hidden":`true`,children:Pn[e.outcome]}),(0,H.jsx)(`span`,{className:`quest-test-name`,children:e.name}),(0,H.jsx)(`span`,{className:`quest-test-outcome`,children:Fn[e.outcome]})]}),n&&e.message&&!t?(0,H.jsx)(`p`,{className:`quest-test-message`,children:e.message}):null,n&&e.problem?(0,H.jsxs)(`p`,{className:`quest-problem-hint`,children:[e.problem.line===null?``:`Line ${e.problem.line}: `,e.problem.hint]}):null,n&&e.hint?(0,H.jsxs)(`p`,{className:`quest-test-hint`,children:[`Hint: `,e.hint]}):null,n&&!e.hidden?(0,H.jsxs)(`div`,{className:`quest-io-grid`,children:[e.input!==null&&e.input!==``?(0,H.jsx)(In,{label:`Input`,text:e.input}):null,e.expected===null?null:(0,H.jsx)(In,{label:`Expected`,text:e.expected}),e.actual===null?null:(0,H.jsx)(In,{label:`Your program`,text:e.actual}),e.diff?(0,H.jsxs)(`p`,{className:`quest-test-diff`,children:[`First difference on line `,e.diff.line,`. Expected `,(0,H.jsx)(Ln,{text:e.diff.expected}),`, got `,(0,H.jsx)(Ln,{text:e.diff.actual}),`. A `,(0,H.jsx)(`code`,{children:`·`}),` is a space.`]}):null]}):null]})}function Bn({result:e}){if(e.kind===`engine`)return(0,H.jsxs)(`div`,{className:`quest-verdict quest-verdict--engine`,role:`status`,children:[(0,H.jsx)(`p`,{className:`quest-verdict-title`,children:`The Java engine had a problem`}),(0,H.jsx)(`p`,{children:e.message}),(0,H.jsx)(`p`,{children:`Your code was not judged. Run it again.`})]});if(e.kind===`rules`)return(0,H.jsxs)(`div`,{className:`quest-verdict quest-verdict--fail`,role:`status`,children:[(0,H.jsx)(`p`,{className:`quest-verdict-title`,children:`Not yet: the quest asks for something else`}),(0,H.jsx)(`ul`,{className:`quest-plain-list`,children:e.failures.map(e=>(0,H.jsx)(`li`,{children:e},e))})]});if(e.kind===`compile`){let t=e.diagnostics.filter(e=>e.severity===`error`).length;return(0,H.jsxs)(`div`,{className:`quest-verdict quest-verdict--fail`,role:`status`,children:[(0,H.jsxs)(`p`,{className:`quest-verdict-title`,children:[t===1?`Java found 1 problem`:`Java found ${t||`some`} problems`,` before it could run your code`]}),e.diagnostics.length>0?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(`p`,{children:`Fix the first one first: one mistake often causes the rest.`}),(0,H.jsx)(`ul`,{className:`quest-plain-list`,children:e.diagnostics.map((e,t)=>(0,H.jsx)(Rn,{diagnostic:e},`${e.line}-${t}`))})]}):(0,H.jsx)(`pre`,{className:`quest-problem-raw`,children:e.raw})]})}return e.kind===`predict`?(0,H.jsx)(`div`,{className:`quest-verdict ${e.passed?`quest-verdict--pass`:`quest-verdict--fail`}`,role:`status`,children:(0,H.jsx)(`p`,{className:`quest-verdict-title`,children:e.passed?`That is exactly what it prints.`:e.wrongLine===null?`Not quite. Trace it again, one pass of the loop at a time.`:`Not quite. Line ${e.wrongLine} of your answer is not what the program prints there.`})}):(0,H.jsxs)(`div`,{className:`quest-verdict ${e.passed?`quest-verdict--pass`:`quest-verdict--fail`}`,role:`status`,children:[(0,H.jsx)(`p`,{className:`quest-verdict-title`,children:e.summary}),(0,H.jsx)(`ul`,{className:`quest-plain-list`,children:e.tests.map(t=>(0,H.jsx)(zn,{test:t,bare:e.hero!==null},t.index))})]})}function Vn(e){return e?e.kind===`compile`?e.diagnostics.filter(e=>e.inStudentFile).map(e=>e.line):e.kind===`tests`?e.tests.flatMap(e=>e.problem&&e.problem.line!==null?[e.problem.line]:[]):[]:[]}var Hn=()=>typeof window>`u`?void 0:window.__shohojQuestRunner,Un={phase:`idle`},Wn=`Running Java is not set up on this copy of Shohoj, so code cannot be run here.`,Gn=`The Java engine could not be downloaded. Check your connection and try again.`,X={status:Un,warm:!1},Z=null,Q=null,Kn=null,$=new Set;function qn(e){if(e!==Kn){Z?.dispose(),Z=null,Q=null,Kn=e,X={status:Un,warm:!1};for(let e of $)e()}}function Jn(e){X={status:e,warm:X.warm||e.phase===`ready`};for(let e of $)e()}var Yn=class extends Error{};function Xn(){if(Q)return Q;let e=Kn;if(e===null)return Jn({phase:`failed`,message:Wn}),Promise.reject(new Yn(Wn));Jn({phase:`loading`,step:`starting`,done:0,total:0});let t=o(async()=>{let{createJavaEngine:e}=await import(`./createEngine-VLtNZX5j.js`);return{createJavaEngine:e}},[]).then(({createJavaEngine:n})=>{let r=n(e);return Q===t&&(Z=r,r.subscribe(Jn)),r});return Q=t,t.catch(()=>{Q===t&&(Q=null,Jn({phase:`failed`,message:Gn}))}),t}function Zn(){Hn()||Xn().then(e=>void e.load().catch(()=>void 0),()=>void 0)}function Qn(){Z?.dispose()}var $n={run:async(e,t)=>{let n=Hn();if(n)return n.run(e,t);let r;try{r=await Xn()}catch(e){return{kind:`engineError`,message:e instanceof Yn?Wn:Gn}}return r.run(e,t)}},er=e=>($.add(e),()=>{$.delete(e)});function tr(){return(0,S.useSyncExternalStore)(er,()=>X)}function nr(){return navigator.connection?.saveData===!0}var rr=(0,S.lazy)(()=>o(()=>import(`./CodeEditor-JHpDusXl.js`),__vite__mapDeps([0,1]))),ir={predict:`Predict the output`,fill:`Fill in the missing line`,fix:`Fix the bug`,write:`Write the code`,hero:`Command the hero`};function ar(e){return e.type===`write`||e.type===`fix`||e.type===`hero`?e.starter:``}function or({status:e,warm:t,running:n,testNumber:r,testCount:i,held:a,onStart:o}){if(a&&e.phase===`idle`)return(0,H.jsxs)(`p`,{className:`quest-engine`,children:[`Running Java needs a one-time download of about 14 MB.`,` `,(0,H.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:o,children:`Download it now`})]});if(e.phase===`failed`)return(0,H.jsxs)(`p`,{className:`quest-engine quest-engine--failed`,role:`status`,children:[e.message,` `,(0,H.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:o,children:`Try again`})]});if(e.phase===`loading`&&t)return(0,H.jsx)(`p`,{className:`quest-engine`,role:`status`,children:`Restarting the Java engine. This takes a few seconds.`});if(e.phase===`loading`){let t=e.step===`downloading`&&e.total>0?Math.round(e.done/e.total*100):null;return(0,H.jsxs)(`div`,{className:`quest-engine`,role:`status`,children:[(0,H.jsxs)(`p`,{children:[e.step===`warming`?`Almost ready: starting the Java compiler…`:t===null?`Getting the Java engine (about 14 MB, once)…`:`Getting the Java engine (about 14 MB, once): ${t}%`,n?` Your code runs as soon as it is ready.`:` You can keep reading, or go back and explore.`]}),(0,H.jsx)(`progress`,{className:`quest-progress`,"aria-label":`Java engine download`,...t===null?{}:{value:t,max:100}})]})}return n?(0,H.jsx)(`p`,{className:`quest-engine`,role:`status`,children:r===null?`Compiling your code…`:`Running test ${r} of ${i}…`}):null}function sr({quest:e,alreadySolved:t,draft:n,onDraft:r,onSolved:i,onClose:a}){let[o]=(0,S.useState)(t),[s,c]=(0,S.useState)(()=>n??ar(e)),[l,u]=(0,S.useState)(null),[d,f]=(0,S.useState)(!1),[p,m]=(0,S.useState)(null),[h,g]=(0,S.useState)(0),[_,v]=(0,S.useState)(()=>e.type!==`predict`&&nr()),{status:y,warm:b}=tr(),x=(0,S.useRef)(null),C=(0,S.useRef)(null),w=(0,S.useRef)(!0),T=e.type!==`predict`;(0,S.useEffect)(()=>(w.current=!0,C.current?.focus(),T&&!nr()&&Zn(),()=>{w.current=!1}),[T]);let E=e=>{c(e),r(e)},D=e.type===`hero`?1:e.type===`predict`?0:e.grading.tests.length,O=async()=>{if(d)return;f(!0),v(!1),m(null);let t=await xn($n,e,s,{onTestBegin:e=>{w.current&&m(e+1)}});t.passed&&i(),w.current&&(u(t),f(!1),window.setTimeout(()=>x.current?.scrollIntoView({block:`nearest`}),0))},k=(0,S.useMemo)(()=>Vn(l),[l]),A=l?.passed===!0,j=e.hints,M=l?.kind===`tests`?l.hero:null,N;if(e.type===`predict`)N=(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(`pre`,{className:`quest-code`,"aria-label":`The code to trace`,tabIndex:0,children:e.snippet}),(0,H.jsx)(`label`,{className:`quest-label`,htmlFor:`quest-predict`,children:`What it prints`}),(0,H.jsx)(`textarea`,{id:`quest-predict`,className:`quest-textarea`,rows:Math.min(10,Math.max(3,e.answer.split(`
`).length)),value:s,onChange:e=>E(e.target.value),autoCapitalize:`off`,autoCorrect:`off`,spellCheck:!1})]});else if(e.type===`fill`){let t=e.template.replace(/\n$/,``).split(`
`);N=(0,H.jsx)(`div`,{className:`quest-code quest-code--lines`,role:`group`,"aria-label":`The program`,children:t.map((e,t)=>{let n=(0,H.jsx)(`span`,{className:`quest-code-number`,children:t+1});return e.trim()===`__BLANK__`?(0,H.jsxs)(`div`,{className:`quest-code-line quest-code-line--blank`,children:[n,(0,H.jsx)(`span`,{children:/^\s*/.exec(e)?.[0]}),(0,H.jsx)(`input`,{className:`quest-fill`,"aria-label":`The missing line, line ${t+1}`,placeholder:`write the missing line`,value:s,onChange:e=>E(e.target.value),onKeyDown:e=>{e.key===`Enter`&&O()},autoCapitalize:`off`,autoCorrect:`off`,spellCheck:!1})]},t):(0,H.jsxs)(`div`,{className:`quest-code-line`,children:[n,(0,H.jsx)(`span`,{children:e===``?` `:e})]},t)})})}else N=(0,H.jsxs)(H.Fragment,{children:[e.type===`hero`?(0,H.jsx)(Nn,{level:e.level,run:M}):null,(0,H.jsx)(S.Suspense,{fallback:(0,H.jsx)(`p`,{className:`quest-engine`,children:`Opening the editor…`}),children:(0,H.jsx)(rr,{value:s,onChange:E,errorLines:k,label:`Your Java code for ${e.title}`})})]});return(0,H.jsxs)(`div`,{className:`quest-panel`,role:`dialog`,"aria-modal":`true`,"aria-labelledby":`quest-panel-title`,children:[(0,H.jsxs)(`div`,{className:`quest-panel-head`,children:[(0,H.jsxs)(`div`,{children:[(0,H.jsxs)(`p`,{className:`quest-kind`,children:[ir[e.type],` · `,e.xp,` XP`,e.boss?` · Boss`:``]}),(0,H.jsx)(`h2`,{id:`quest-panel-title`,ref:C,tabIndex:-1,children:e.title})]}),(0,H.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:a,children:`Back`})]}),(0,H.jsxs)(`div`,{className:`quest-panel-body`,children:[(0,H.jsxs)(`details`,{className:`quest-story`,children:[(0,H.jsx)(`summary`,{children:`The story so far`}),e.story.map(e=>(0,H.jsx)(`p`,{children:e},e))]}),(0,H.jsx)(`p`,{className:`quest-task`,children:e.task}),o&&!A?(0,H.jsx)(`p`,{className:`quest-note`,children:`You have solved this one. Solve it again for practice: its XP counts once.`}):null,N,T?(0,H.jsx)(or,{status:y,warm:b,running:d,testNumber:p,testCount:D,held:_,onStart:()=>{v(!1),Zn()}}):null,(0,H.jsxs)(`div`,{ref:x,children:[l?(0,H.jsx)(Bn,{result:l}):null,A?(0,H.jsxs)(`div`,{className:`quest-solved`,children:[(0,H.jsx)(`p`,{className:`quest-solved-title`,children:o?`Solved again.`:`Solved. +${e.xp} XP`}),e.type===`predict`?(0,H.jsx)(`p`,{children:e.explanation}):null,(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,onClick:a,children:`Back to the zone`})]}):null]}),j.length>0&&!A?(0,H.jsxs)(`div`,{className:`quest-hints`,children:[j.slice(0,h).map((e,t)=>(0,H.jsxs)(`p`,{className:`quest-hint`,children:[(0,H.jsxs)(`strong`,{children:[`Hint `,t+1,`.`]}),` `,e]},e)),h<j.length?(0,H.jsxs)(`button`,{type:`button`,className:`quest-link`,onClick:()=>g(e=>e+1),children:[h===0?`Show a hint`:`Show another hint`,` (`,h,` of`,` `,j.length,` shown)`]}):null]}):null]}),(0,H.jsxs)(`div`,{className:`quest-panel-foot`,children:[e.type===`write`||e.type===`fix`||e.type===`hero`?(0,H.jsx)(`button`,{type:`button`,className:`quest-button`,disabled:d||s===e.starter,onClick:()=>{window.confirm(`Put the starting code back? What you typed will be lost.`)&&E(e.starter)},children:`Start again`}):null,(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,disabled:d,onClick:()=>void O(),children:d?`Running…`:e.type===`predict`?`Check`:`Run`})]})]})}var cr=3e4;function lr(e,t){return new Promise((n,r)=>{let i=setTimeout(()=>r(Error(`not settled within ${t} ms`)),t);e.then(e=>{clearTimeout(i),n(e)},e=>{clearTimeout(i),r(e)})})}var ur=Ge(),dr=Qe();function fr({store:e=ur,drafts:t=dr,javaSandboxUrl:n=null,onLeave:r,loadZone3d:i}){(0,S.useEffect)(()=>{qn(n)},[n]);let a=(0,S.useMemo)(()=>Ce(),[]),o=(0,S.useMemo)(()=>we(a).find(e=>e.status===`open`)??null,[a]);return o?(0,H.jsx)(pr,{zone:o,store:e,drafts:t,onLeave:r,loadZone3d:i}):(0,H.jsxs)(`section`,{className:`shell-page`,children:[(0,H.jsx)(`h1`,{children:`Shohoj Quest`}),(0,H.jsx)(`p`,{className:`shell-muted`,children:`No zone is open yet.`})]})}function pr({zone:e,store:t,drafts:n,onLeave:r,loadZone3d:i}){let s=(0,S.useMemo)(()=>Ce(),[]),[c,l]=(0,S.useState)(null),[u,d]=(0,S.useState)({kind:`world`}),[f,p]=(0,S.useState)(`loading`),[m,h]=(0,S.useState)(0),[g,_]=(0,S.useState)(!1),v=(0,S.useRef)(null),y=(0,S.useRef)(null);(0,S.useEffect)(()=>{let n=!0,r=t=>{n&&l(n=>n??(t?Ie(t,e.id):Me(e.id)))};t.load().then(r,()=>r(null));let i=t.onRemote?.(t=>{n&&l(n=>n?z(n,t):Ie(t,e.id))});return()=>{n=!1,i?.()}},[t,e.id]),(0,S.useEffect)(()=>{c&&t.save(c)},[c,t]),(0,S.useEffect)(()=>{let e=()=>{document.visibilityState===`hidden`&&(t.flush?.(),n.flush())};return document.addEventListener(`visibilitychange`,e),()=>{document.removeEventListener(`visibilitychange`,e),n.flush()}},[t,n]);let b=(0,S.useMemo)(()=>c?Ne(c):new Set,[c]),x=(0,S.useMemo)(()=>({completed:b,open:new Set(e.quests.filter(e=>R(e,b)===`open`).map(e=>e.id))}),[b,e]),T=Ee(s,b),E=e.quests.filter(e=>b.has(e.id)).length,D=e.giver?.name??`The quest-giver`,O=(0,S.useCallback)(e=>{let t=R(e,b);if(t===`locked`){let t=e.requires.filter(e=>!b.has(e)).map(e=>Te(s,e)?.title??e);d({kind:`notice`,text:`Not yet. "${e.title}" needs you to finish ${t.join(` and `)} first.`})}else t===`open`&&d({kind:`talk`,questId:e.id,line:0})},[b,s]),k=(0,S.useCallback)(t=>{switch(t.kind){case`ready`:p(`ready`);break;case`failed`:p(`failed`);break;case`moved`:l(e=>e&&Fe(e,t.at));break;case`giver`:{let t=e.quests.find(e=>R(e,b)===`open`);t?O(t):d({kind:`notice`,text:`There is nothing left for me to teach you here. The far gate is open: the road north is yours.`});break}case`gate`:{let n=e.quests.find(e=>e.id===t.quest);n&&O(n);break}case`exit`:d({kind:`cleared`})}},[b,O,e]),A=(0,S.useRef)({onZoneEvent:k,zoneState:x,paused:u.kind!==`world`,progress:c});(0,S.useEffect)(()=>{A.current={onZoneEvent:k,zoneState:x,paused:u.kind!==`world`,progress:c}});let j=c!==null;(0,S.useEffect)(()=>{let t=v.current,n=e.map?w[e.map]:void 0;if(!j||!t)return;let r=!0,a=null;return(async()=>{if(!n)throw Error(`no map is registered for "${e.map??``}"`);let s=Oe(window.location.search),c=i&&ke(s,!0,je)===`3d`?lr(i(),cr):null;c?.catch(()=>void 0);let l=await n(),u=rt(l);if(!u.ok)throw Error(u.error.join(` `));if(!r)return;let d=()=>({parent:t,mapJson:l,map:u.value,state:A.current.zoneState,start:A.current.progress?.at??null,onEvent:e=>A.current.onZoneEvent(e)});if(a=null,c)try{let{createZoneGame:e}=await c;if(!r)return;a=e(d()),_(!0)}catch{a=null}if(!a){_(!1);let{createZoneGame:e}=await o(async()=>{let{createZoneGame:e}=await import(`./zoneGame-DsbcJWFl.js`);return{createZoneGame:e}},[]);if(!r)return;a=e(d())}a.setPaused(A.current.paused),y.current=a})().catch(()=>{r&&p(`failed`)}),()=>{r=!1,y.current=null,a?.destroy()}},[j,e.map,m,i]),(0,S.useEffect)(()=>{y.current?.setState(x)},[x]);let M=u.kind!==`world`;(0,S.useEffect)(()=>{y.current?.setPaused(M)},[M]);let N=(0,S.useRef)(null);(0,S.useEffect)(()=>{let e=document.documentElement;e.classList.add(`quest-open`);let t=window.visualViewport,n=()=>{t&&N.current?.style.setProperty(`--quest-height`,`${t.height}px`)};return n(),t?.addEventListener(`resize`,n),()=>{e.classList.remove(`quest-open`),t?.removeEventListener(`resize`,n),Qn()}},[]),(0,S.useEffect)(()=>{if(u.kind===`world`)return;let e=e=>{e.key===`Escape`&&(e.target instanceof Element&&e.target.closest(`.cm-editor`)||d({kind:`world`}))};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[u.kind]);let P=()=>d({kind:`world`}),ee=(0,S.useMemo)(()=>typeof window.matchMedia==`function`&&window.matchMedia(`(pointer: coarse)`).matches,[]),F=u.kind===`quest`?Te(s,u.questId):null,I=u.kind===`talk`?Te(s,u.questId):null;return(0,C.createPortal)((0,H.jsxs)(`div`,{className:`quest-root`,ref:N,children:[(0,H.jsxs)(`div`,{className:`quest-hud`,children:[r?(0,H.jsx)(`button`,{type:`button`,className:`quest-hud-back`,"aria-label":`Leave the game, back to Shohoj`,onClick:r,children:`← Shohoj`}):(0,H.jsx)(a,{to:`/`,className:`quest-hud-back`,"aria-label":`Leave the game, back to Shohoj`,children:`← Shohoj`}),(0,H.jsx)(`h1`,{className:`quest-hud-title`,children:e.name}),(0,H.jsxs)(`span`,{className:`quest-hud-xp`,"aria-label":`${T} experience points`,children:[T,` XP`]}),(0,H.jsxs)(`button`,{type:`button`,className:`quest-button`,onClick:()=>d({kind:`log`}),"aria-haspopup":`dialog`,children:[`Quests `,E,`/`,e.quests.length]})]}),(0,H.jsxs)(`div`,{className:`quest-stage`,ref:v,"aria-hidden":M?`true`:void 0,children:[f===`loading`?(0,H.jsxs)(`p`,{className:`quest-stage-note`,children:[`Loading `,e.name,`…`]}):null,f===`failed`?(0,H.jsxs)(`div`,{className:`quest-stage-note`,role:`alert`,children:[(0,H.jsx)(`p`,{children:`The zone could not be loaded. Check your connection.`}),(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,onClick:()=>{p(`loading`),h(e=>e+1)},children:`Try again`})]}):null]}),u.kind===`world`&&f===`ready`?(0,H.jsx)(`p`,{className:`quest-tip`,children:E===0?`${ee?`Tap where you want to walk.`:`Click where you want to walk, or use the arrow keys.`} ${D} is waiting by the bridge.`:E===e.quests.length?`The far gate is open. Take the road north.`:`Walk up to a marked part of the bridge to work on it, or open Quests.`}):null,(0,H.jsxs)(`p`,{className:`quest-credit`,children:[(0,H.jsx)(`a`,{href:`https://cheerpj.com/`,target:`_blank`,rel:`noreferrer`,children:`Built with CheerpJ`}),(0,H.jsx)(`span`,{children:` · `}),(0,H.jsx)(`a`,{href:`https://kenney.nl/`,target:`_blank`,rel:`noreferrer`,children:`Art by Kenney`}),g?(0,H.jsxs)(H.Fragment,{children:[(0,H.jsx)(`span`,{children:` · `}),(0,H.jsx)(`a`,{href:`https://quaternius.com/`,target:`_blank`,rel:`noreferrer`,children:`People by Quaternius`})]}):null]}),u.kind===`talk`&&I?(0,H.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`${D} speaks`,children:[(0,H.jsx)(`p`,{className:`quest-dialog-speaker`,children:D}),(0,H.jsx)(`p`,{className:`quest-dialog-text`,"aria-live":`polite`,children:I.story[u.line]}),(0,H.jsxs)(`div`,{className:`quest-dialog-actions`,children:[(0,H.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:P,children:`Not now`}),u.line<I.story.length-1?(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:()=>d({...u,line:u.line+1}),children:`Next`}):(0,H.jsxs)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:()=>d({kind:`quest`,questId:I.id}),children:[`Take the quest: `,I.title]})]})]}):null,u.kind===`notice`?(0,H.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`${D} speaks`,children:[(0,H.jsx)(`p`,{className:`quest-dialog-speaker`,children:D}),(0,H.jsx)(`p`,{className:`quest-dialog-text`,children:u.text}),(0,H.jsx)(`div`,{className:`quest-dialog-actions`,children:(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:P,children:`All right`})})]}):null,u.kind===`cleared`?(0,H.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`Zone complete`,children:[(0,H.jsxs)(`p`,{className:`quest-dialog-speaker`,children:[`You crossed `,e.name]}),(0,H.jsxs)(`p`,{className:`quest-dialog-text`,children:[T,` XP earned. The road goes on, but the next place is not built yet. Every quest here can be solved again from the quest log.`]}),(0,H.jsx)(`div`,{className:`quest-dialog-actions`,children:(0,H.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:P,children:`Keep exploring`})})]}):null,F?(0,H.jsx)(`div`,{className:`quest-sheet`,children:(0,H.jsx)(sr,{quest:F,alreadySolved:b.has(F.id),draft:n.get(F.id),onDraft:e=>n.set(F.id,e),onSolved:()=>l(e=>e&&Pe(e,F.id,Date.now())),onClose:P},F.id)}):null,u.kind===`log`?(0,H.jsx)(`div`,{className:`quest-sheet`,children:(0,H.jsx)(dt,{world:s,zone:e,completed:b,xp:T,onOpen:e=>d({kind:`quest`,questId:e}),onClose:P})}):null]}),document.body)}function mr(e){let t=null;return{async sync(n,r){t??=e().catch(e=>{throw t=null,e});let i={kind:`ok`,progress:null};return await(await t).transact(n,e=>{if(e===void 0){let e=r!==null&&We(null,r);return i={kind:`ok`,progress:e?r:null},e?{...Be(r)}:null}let t=Ve(e);if(!t)return i={kind:`unreadable`},null;let n=r?z(r,t):t,a=We(t,n);return i={kind:`ok`,progress:a?n:t},a?{...Be(n)}:null}),i}}}var hr=3e4;function gr(e){let{uid:t,storage:n,repo:r}=e,i=e.timers??$e,a=e.now??(()=>Date.now()),o=new Set,s=null,c,l=!1,u=!1,d=!1,f=null,p=()=>!r||l||u?!1:c===void 0?!0:s?We(c,c?z(s,c):s):!1,m=async()=>{if(r&&!d&&p()){d=!0;try{let e=await r.sync(t,s);if(u)return;if(e.kind===`unreadable`){l=!0;return}if(c=e.progress,c){let e=s?z(s,c):c;if(!He(e,s)){s=e,Ze(n,t,e);for(let t of o)t(e)}}}catch{}finally{d=!1}p()&&c!==void 0&&h(800)}};function h(e){if(!r||l||u)return;let t=a()+e;f&&f.due<=t||(f&&i.clear(f.handle),f={handle:i.set(()=>{f=null,m()},e),due:t})}let g=()=>{f&&(i.clear(f.handle),f=null,m())};return{load(){return s=Xe(n,t),m(),Promise.resolve(s)},save(e){if(u)return;let r=s?z(e,s):e;if(He(r,s))return;let i=!Ue(r,s);if(s=r,Ze(n,t,r),r!==e)for(let e of o)e(r);p()&&h(i?800:hr)},onRemote(e){return o.add(e),()=>{o.delete(e)}},flush:g,stop(){g(),u=!0},start(){u=!1,m()}}}function _r(){let e=s();return(0,S.useMemo)(()=>{if(window.__shohojQuestSandboxUrl)return window.__shohojQuestSandboxUrl;if(!e)return null;try{let t=new URL(`quest-sandbox/`,`${e.papersWorkerUrl.replace(/\/+$/,``)}/`);return t.origin===window.location.origin?null:t.href}catch{return null}},[e])}function vr(){try{return window.localStorage}catch{return new b}}function yr(){let e=s(),{uid:t}=x(),n=(0,S.useMemo)(()=>{if(!t)return{store:Ge(),drafts:Qe(),synced:null};let n=window.__shohojQuestProgressRepo?window.__shohojQuestProgressRepo:e?mr(async()=>{let{createQuestProgressBackend:t}=await o(async()=>{let{createQuestProgressBackend:e}=await import(`./questProgressRepo-DFx3Zyla.js`);return{createQuestProgressBackend:e}},__vite__mapDeps([2,3,1,4,5,6,7,8,9,10,11,12,13]));return t({config:e.firebase,...e.recaptchaV3SiteKey?{recaptchaV3SiteKey:e.recaptchaV3SiteKey}:{}})}):null,r=vr(),i=gr({uid:t,storage:r,repo:n});return{store:i,drafts:et({uid:t,storage:r}),synced:i}},[t,e]);return(0,S.useEffect)(()=>{let{synced:e,drafts:t}=n;if(e)return e.start(),()=>{t.flush(),e.stop()}},[n]),n}var br=t({Component:()=>xr});function xr(){let{store:e,drafts:t}=yr(),n=_r();return(0,H.jsx)(fr,{store:e,drafts:t,javaSandboxUrl:n})}export{xr as Component,st as _,wn as a,un as c,yn as d,ct as f,at as g,it as h,Cn as i,dn as l,ot as m,En as n,G as o,ut as p,Dn as r,Sn as s,br as t,ln as u};