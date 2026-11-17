const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["./CodeEditor-DB5d0ZxW.js","./jsx-runtime-DyZJNswf.js","./zoneGame3d-26YGU0DD.js","./three.module-DbuwKGmk.js"])))=>i.map(i=>d[i]);
import{i as e,n as t,t as n}from"./jsx-runtime-DyZJNswf.js";import{n as r}from"./client-C76QW5vH.js";import{t as i}from"./lib-D13AlFFq.js";import{t as a}from"./preload-helper-B1aobi-H.js";import{a as o,d as s,f as c,i as l,l as u,m as d,n as f,o as p,r as m,s as h,t as g,u as _}from"./schema-ffu6J9ii.js";import{_ as v,c as y,d as b,g as x,l as S,n as C,s as w,u as T}from"./localProgress-EDUrMjta.js";var E=e(t(),1),ee=r(),D=n(),O=new URL(`roguelikeChar_transparent-DP2joJTf.png`,import.meta.url).href,k=new URL(`roguelikeSheet_transparent-COc4qv4E.png`,import.meta.url).href,A=(e,t)=>({column:e,row:t}),j={hero:[A(0,1),A(3,0),A(4,0),A(7,5),A(23,4)],boatman:[A(1,2),A(3,3),A(7,4),A(21,8),A(28,8)],seller:[A(1,1),A(3,2),A(6,8),A(22,6)],fisher:[A(0,2),A(3,3),A(8,9),A(29,8)],farmer:[A(0,2),A(3,0),A(4,1),A(10,10),A(23,5),A(28,8)],villager:[A(0,1),A(3,5),A(6,0),A(24,5)]},M=e=>Object.prototype.hasOwnProperty.call(j,e),N={columns:57,rows:31,width:968,height:526},P={columns:54,rows:12,width:918,height:203},te=(e,t)=>t.row*e.columns+t.column,F={floor:{column:8,row:2},wall:{column:0,row:0},item:{column:17,row:7},goal:{column:20,row:0}},I=e=>typeof e==`object`&&!!e&&!Array.isArray(e),L=e=>typeof e==`number`&&Number.isInteger(e)&&e>0;function R(e){return e.startsWith(`built`)?`built`:e.startsWith(`barrier`)?`barrier`:`always`}function ne(e,t){let n=e.properties;if(Array.isArray(n)){for(let e of n)if(I(e)&&e.name===t)return typeof e.value==`string`?e.value:null}else if(I(n)&&typeof n[t]==`string`)return n[t];return null}function re(e){if(!I(e))return c([`The map is not a Tiled JSON object.`]);let t=[],n=e.width,r=e.height,i=e.tilewidth;e.orientation!==`orthogonal`&&t.push(`The map must be orthogonal.`),e.infinite===!0&&t.push(`The map must not be infinite. Turn that off in Map Properties.`),L(n)&&L(r)||t.push(`The map needs a width and a height.`),L(i)&&e.tileheight===i||t.push(`Tiles must be square.`);let a=e.layers;if(Array.isArray(a)||t.push(`The map has no layers.`),t.length>0||!L(n)||!L(r)||!L(i))return c(t);let o=n*r,s=Array(o).fill(!1),l=[],u=new Set,f=null,p=[];for(let e of Array.isArray(a)?a:[]){if(!I(e))continue;let n=typeof e.name==`string`?e.name:``;if(e.type===`objectgroup`){n===`markers`&&Array.isArray(e.objects)&&(f=e.objects),n===`scenery`&&Array.isArray(e.objects)&&(p=e.objects);continue}if(e.type!==`tilelayer`){t.push(`Layer "${n}" is a ${String(e.type)} layer. Use tile layers and one object layer.`);continue}if(n===``||u.has(n)){t.push(`Every tile layer needs its own name. "${n}" is missing or repeated.`);continue}u.add(n);let r=e.data;!Array.isArray(r)||r.length!==o?t.push(`Layer "${n}" is not plain tile data. Export with Tile Layer Format set to CSV and no compression.`):n.startsWith(`blocked`)?r.forEach((e,t)=>{typeof e==`number`&&e!==0&&(s[t]=!0)}):l.push({name:n,role:R(n),above:n.startsWith(`above`)})}l.length===0&&t.push(`The map has nothing to draw: add a tile layer.`);let m=Array.isArray(e.tilesets)?e.tilesets:[],h=m[0],g=null;if(m.length!==1||!I(h))t.push(`The map must use exactly one tileset.`);else if(typeof h.name!=`string`||typeof h.image!=`string`)t.push(`The tileset must be embedded in the map. In Tiled, use "Embed in Map" on the Tilesets panel.`);else if(h.tilewidth!==i||h.tileheight!==i)t.push(`The tileset's tiles are not the size of the map's squares.`);else{let e=e=>typeof e==`number`&&Number.isInteger(e)&&e>=0?e:0;g={name:h.name,margin:e(h.margin),spacing:e(h.spacing)}}f===null&&t.push(`The map needs an object layer named "markers".`);let _=e=>typeof e==`number`?e:NaN,v=e=>Math.floor(e/i),y=e=>e.x>=0&&e.y>=0&&e.x<n&&e.y<r,b=new Map,x=[],S=null;for(let e of f??[]){if(!I(e))continue;let n=typeof e.name==`string`?e.name:``,r=_(e.x),i=_(e.y),a=Math.max(1,_(e.width)||0),o=Math.max(1,_(e.height)||0),s={x:v(r),y:v(i)},c=v(r+a-1),l=v(i+o-1),u={...s,w:c-s.x+1,h:l-s.y+1};if(!y(s)||!y({x:c,y:l}))t.push(`The "${n}" marker is outside the map.`);else if(n===`spawn`||n===`giver`)b.has(n)&&t.push(`There are two "${n}" markers. Keep one.`),b.set(n,s);else if(n===`exit`)S&&t.push(`There are two "exit" markers. Keep one.`),S=u;else if(n===`gate`){let n=ne(e,`quest`);n?x.push({...u,quest:n}):t.push(`The gate at ${s.x},${s.y} needs a string property "quest" holding a quest id.`)}else t.push(`"${n}" is not a marker the game knows. Use spawn, giver, exit or gate.`)}let C=[];for(let e of p){if(!I(e))continue;let r=typeof e.name==`string`?e.name:``,a=e.gid,o=typeof a==`number`&&Number.isInteger(a)&&a>0,c=_(e.x),l=o?_(e.y)-i:_(e.y),u={x:v(c),y:v(l)};if(!y(u))t.push(`A "${r||`tile`}" in the scenery layer is outside the map.`);else if(o)C.push({kind:`tile`,at:u,gid:a,floats:r===`float`});else if(r===`figure`){let r=ne(e,`look`);if(!r){t.push(`The figure at ${u.x},${u.y} needs a string property "look" naming a person.`);continue}C.push({kind:`figure`,at:u,look:r}),s[u.y*n+u.x]=!0}else t.push(`"${r}" is not scenery the game knows. Use a figure, or a tile object.`)}let w=b.get(`spawn`),T=b.get(`giver`);return f!==null&&(w||t.push(`The markers layer needs a "spawn" point.`),T||t.push(`The markers layer needs a "giver" point.`),S||t.push(`The markers layer needs an "exit" rectangle.`)),t.length>0||!w||!T||!S||!g?c(t):d({width:n,height:r,tileSize:i,tileset:g,layers:l,blocked:s,spawn:w,giver:T,exit:S,gates:x,scenery:C})}var ie=(e,t)=>t.x>=e.x&&t.y>=e.y&&t.x<e.x+e.w&&t.y<e.y+e.h;function ae(e,t){return e.gates.filter(e=>!t.has(e.quest))}function oe(e,t,n){return ae(e,t).find(e=>ie(e,n))??null}function se(e,t){let n=e.blocked.map(e=>!e);n[e.giver.y*e.width+e.giver.x]=!1;for(let r of ae(e,t))for(let t=r.y;t<r.y+r.h;t+=1)for(let i=r.x;i<r.x+r.w;i+=1)n[t*e.width+i]=!1;return{width:e.width,height:e.height,open:n}}function ce(e,t){return t.x>=0&&t.y>=0&&t.x<e.width&&t.y<e.height&&e.open[t.y*e.width+t.x]===!0}var le=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];function ue(e,t,n){let r=t.y*e.width+t.x,i=new Map([[r,-1]]),a=[r],o=t=>Math.abs(t%e.width-n.x)+Math.abs(Math.floor(t/e.width)-n.y),s=r,c=o(r);for(let t=0;t<a.length&&c>0;t+=1){let n=a[t],r=n%e.width,l=Math.floor(n/e.width);for(let t of le){let u={x:r+t.x,y:l+t.y},d=u.y*e.width+u.x;if(!ce(e,u)||i.has(d))continue;i.set(d,n),a.push(d);let f=o(d);f<c&&(s=d,c=f)}}let l=[];for(let t=s;t!==r;t=i.get(t))l.push({x:t%e.width,y:Math.floor(t/e.width)});return l.reverse(),{steps:l,short:c}}var de=`__BLANK__`,fe=3e3,z=_().max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/,`use lowercase words joined by hyphens`),pe=_().regex(/^[A-Za-z_][A-Za-z0-9_]*$/,`not a Java identifier`),B=_().min(1),V=_().min(1),me=f([`int`,`long`,`double`,`boolean`,`char`,`String`,`int[]`,`long[]`,`double[]`,`boolean[]`,`char[]`,`String[]`]),he=s([h(),l(),_()]),ge=s([he,m(he)]),_e=-2147483648,ve=2147483647;function ye(e,t){switch(e){case`int`:return typeof t==`number`&&Number.isInteger(t)&&t>=_e&&t<=ve;case`long`:return typeof t==`number`&&Number.isSafeInteger(t);case`double`:return typeof t==`number`&&Number.isFinite(t);case`boolean`:return typeof t==`boolean`;case`char`:return typeof t==`string`&&t.length===1;case`String`:return typeof t==`string`;default:return!1}}function be(e,t){if(e.endsWith(`[]`)){let n=e.slice(0,-2);return Array.isArray(t)&&t.every(e=>ye(n,e))}return!Array.isArray(t)&&ye(e,t)}var xe=o(`kind`,[u({kind:p(`requires`),anyOf:m(_().min(1)).min(1),message:B}),u({kind:p(`atMost`),token:_().min(1),max:h().int().min(0),message:B})]),Se={name:_().min(1).optional(),hidden:l().default(!1),hint:_().min(1).optional()},Ce=u({...Se,stdin:_().default(``),expected:_()}),we=u({...Se,args:m(ge),expected:ge.optional(),expectedStdout:_().optional()}),Te=u({mode:p(`stdio`),tests:m(Ce).min(1)}),Ee=u({mode:p(`method`),className:pe.default(`Solution`),method:u({name:pe,params:m(u({type:me,name:pe})),returns:s([me,p(`void`)])}),tests:m(we).min(1)}),De=o(`mode`,[Te,Ee]),Oe={id:z,title:_().min(1).max(60),story:m(B).min(1),task:B,concepts:m(_().min(1)).min(1),xp:h().int().min(0).max(1e3),hints:m(B).default([]),requires:m(z).default([]),boss:l().default(!1)},ke={...Oe,grading:De,rules:m(xe).default([]),timeLimitMs:h().int().min(500).max(1e4).default(fe)},Ae=u({...ke,type:p(`write`),starter:V}),je=u({...ke,type:p(`fix`),starter:V}),Me=u({...ke,type:p(`fill`),template:V}),Ne=u({...Oe,type:p(`predict`),snippet:V,answer:_().min(1),explanation:B}),Pe=u({grid:m(_().min(1)).min(1),facing:f([`N`,`E`,`S`,`W`])}),Fe=u({...Oe,type:p(`hero`),starter:V,level:Pe,goal:u({reach:l().default(!0),collectAll:l().default(!1)}).default({reach:!0,collectAll:!1}),maxActions:h().int().min(1).max(2e3).default(200),rules:m(xe).default([]),timeLimitMs:h().int().min(500).max(1e4).default(fe)});function Ie(e,t){let{params:n,returns:r}=e.method;e.tests.forEach((e,i)=>{let a=[`grading`,`tests`,i];e.args.length!==n.length&&t(`expected ${n.length} argument(s), got ${e.args.length}`,[...a,`args`]),e.args.forEach((e,r)=>{let i=n[r];i&&!be(i.type,e)&&t(`argument ${r+1} is not a valid ${i.type}`,[...a,`args`,r])}),r===`void`?(e.expected!==void 0&&t(`a void method has no return value to expect`,[...a,`expected`]),e.expectedStdout===void 0&&t(`a void method needs expectedStdout`,[...a,`expectedStdout`])):e.expected===void 0?t(`expected is required for a method returning ${r}`,[...a,`expected`]):be(r,e.expected)||t(`expected is not a valid ${r}`,[...a,`expected`])})}function Le(e,t,n){let r=e.grid[0]?.length??0,i=t=>e.grid.join(``).split(t).length-1;e.grid.forEach((e,t)=>{e.length!==r&&n(`every row must be the same length`,[`level`,`grid`,t]),/[^SG.*#]/.test(e)&&n(`only S, G, ., * and # are allowed`,[`level`,`grid`,t])}),i(`S`)!==1&&n(`the grid needs exactly one S`,[`level`,`grid`]),i(`G`)>1&&n(`the grid can have at most one G`,[`level`,`grid`]),t&&i(`G`)!==1&&n(`goal.reach needs a G on the grid`,[`level`,`grid`])}var Re=o(`type`,[Ae,je,Me,Ne,Fe]).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n});if(e.requires.includes(e.id)&&n(`a quest cannot require itself`,[`requires`]),e.type!==`predict`){if(e.type===`hero`)Le(e.level,e.goal.reach,n),e.goal.collectAll&&!e.level.grid.some(e=>e.includes(`*`))&&n(`goal.collectAll needs at least one * on the grid`,[`goal`,`collectAll`]);else{if(e.type===`fill`){let t=e.template.split(`
`).filter(e=>e.trim()===de).length;t!==1&&n(`the template needs exactly one line that is only ${de}, found ${t}`,[`template`])}e.grading.tests.some(e=>!e.hidden)||n(`at least one test must be visible, so the student can see what is asked`,[`grading`,`tests`]),e.grading.mode===`method`&&Ie(e.grading,n)}}}),ze=u({id:z,order:h().int().min(1),name:_().min(1).max(40),tagline:B,topics:m(_().min(1)).min(1),status:f([`open`,`locked`]),map:z.optional(),giver:u({name:_().min(1).max(40)}).optional(),quests:m(Re).default([])}).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n}),r=new Set;e.quests.forEach((e,t)=>{r.has(e.id)&&n(`duplicate quest id "${e.id}"`,[`quests`,t,`id`]),e.requires.forEach((i,a)=>{i!==e.id&&!r.has(i)&&n(`"${i}" must be a quest listed earlier in this zone`,[`quests`,t,`requires`,a])}),r.add(e.id)}),e.quests.filter(e=>e.boss).length>1&&n(`a zone has at most one boss quest`,[`quests`]),e.status===`open`&&(e.map||n(`an open zone needs a map`,[`map`]),e.giver||n(`an open zone needs a quest-giver`,[`giver`]),e.quests.length===0&&n(`an open zone needs at least one quest`,[`quests`]))}),Be=u({zones:m(ze).min(1)}).superRefine((e,t)=>{let n=(e,n)=>t.addIssue({code:`custom`,message:e,path:n}),r=new Set,i=new Set,a=new Set;e.zones.forEach((e,t)=>{r.has(e.id)&&n(`duplicate zone id "${e.id}"`,[`zones`,t,`id`]),i.has(e.order)&&n(`duplicate zone order ${e.order}`,[`zones`,t,`order`]),r.add(e.id),i.add(e.order),e.quests.forEach((e,r)=>{a.has(e.id)&&n(`quest id "${e.id}" is already used in another zone`,[`zones`,t,`quests`,r,`id`]),a.add(e.id)})})});function Ve(e){return g(Be,e,`world`)}function He(e,t){switch(e){case`\\`:return`\\\\`;case`
`:return`\\n`;case`\r`:return`\\r`;case`	`:return`\\t`;default:{if(e===t)return`\\${t}`;let n=e.charCodeAt(0);return n<32||n>126?`\\u${n.toString(16).padStart(4,`0`)}`:e}}}function H(e){let t=`"`;for(let n=0;n<e.length;n+=1)t+=He(e.charAt(n),`"`);return`${t}"`}function Ue(e,t){switch(e){case`int`:return String(t);case`long`:return`${String(t)}L`;case`double`:{let e=String(t);return/[.eE]/.test(e)?e:`${e}.0`}case`boolean`:return t===!0?`true`:`false`;case`char`:return`'${He(String(t),`'`)}'`;default:return H(String(t))}}function We(e,t){if(Array.isArray(t)){let n=e.slice(0,-2);return`new ${e}{${t.map(e=>Ue(n,e)).join(`, `)}}`}return Ue(e,t)}function Ge(e){return`${e}.class`}function U(e,t){return e===`String`?`"${String(t)}"`:e===`char`?`'${String(t)}'`:String(t)}function Ke(e,t){if(Array.isArray(t)){let n=e.slice(0,-2);return`[${t.map(e=>U(n,e)).join(`, `)}]`}return U(e,t)}function qe(e,t){if(t===`null`)return`null`;if(e.endsWith(`[]`)){let n=e.slice(0,-2);return`[${Je(t).map(e=>U(n,e)).join(`, `)}]`}return U(e,t)}function Je(e){let t=e.startsWith(`[`)&&e.endsWith(`]`)?e.slice(1,-1):e;return t===``?[]:t.split(``)}function Ye(e,t,n){if(e===`double`){let e=Number(n),r=Number(t);return Number.isFinite(e)?Math.abs(e-r)<=1e-6*Math.max(1,Math.abs(r)):!1}return String(t)===n}function Xe(e,t,n){if(n===`null`)return!1;if(Array.isArray(t)){let r=e.slice(0,-2),i=Je(n);return i.length===t.length&&t.every((e,t)=>Ye(r,e,i[t]??``))}return Ye(e,t,n)}function Ze(e){let t=``,n=0,r=e.length,i=e=>e===`
`?`
`:` `;for(;n<r;){let a=e.charAt(n),o=e.charAt(n+1);if(a===`/`&&o===`/`)for(;n<r&&e.charAt(n)!==`
`;)t+=` `,n+=1;else if(a===`/`&&o===`*`){let a=e.indexOf(`*/`,n+2),o=a===-1?r:a+2;for(;n<o;n+=1)t+=i(e.charAt(n))}else if(a===`"`||a===`'`){for(t+=a,n+=1;n<r&&e.charAt(n)!==a&&e.charAt(n)!==`
`;)e.charAt(n)===`\\`&&n+1<r&&e.charAt(n+1)!==`
`?(t+=`  `,n+=2):(t+=` `,n+=1);n<r&&e.charAt(n)===a&&(t+=a,n+=1)}else t+=a,n+=1}return t}var Qe=e=>/^\w+$/.test(e),$e=e=>e.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);function et(e,t){if(Qe(t))return e.match(RegExp(`\\b${$e(t)}\\b`,`g`))?.length??0;let n=e.replace(/\s+/g,``),r=t.replace(/\s+/g,``);return r?n.split(r).length-1:0}function tt(e,t){let n=Ze(e),r=[];for(let e of t)e.kind===`requires`?e.anyOf.some(e=>et(n,e)>0)||r.push(e.message):et(n,e.token)>e.max&&r.push(e.message);return r}function nt(e,t){let n=e.split(`
`),r=n.findIndex(e=>e.trim()===de);if(r===-1)return{source:e,firstLine:1,lineCount:0};let i=``;for(let e=r-1;e>=0;--e){let t=n[e]??``;if(t.trim()){i=/^\s*/.exec(t)?.[0]??``;break}}let a=t.replace(/\r\n?/g,`
`).split(`
`).map(e=>e.trim()).filter(e=>e.length>0),o=a.length>0?a.map(e=>i+e):[``];return n.splice(r,1,...o),{source:n.join(`
`),firstLine:r+1,lineCount:o.length}}var rt=e=>`QuestHarness.at(${e}); `,it=/^(?:else\b|catch\b|finally\b|case\b|default\b|public\b|private\b|protected\b|static\b|abstract\b|class\b|interface\b|enum\b|@|(?:this|super)\s*\(|[^\w(+-]|[+-](?![+-]))/;function at(e){let t=e.split(`
`),n=Ze(e).split(`
`),r=[],i=0,a=``,o=``;return t.map((e,t)=>{let s=n[t]??``,c=s.trim(),l=a===`;`||a===`{`||a===`}`||a===`:`&&/^(?:case|default)\b/.test(o),u=r.length>=2&&r[r.length-1]===`code`,d=c!==``&&l&&u&&i===0&&!it.test(c);for(let e=0;e<s.length;e+=1){let t=s.charAt(e);t===`{`?r.push(/[=,{\]]/.test(a)?`data`:`code`):t===`}`?r.pop():t===`(`?i+=1:t===`)`&&(i=Math.max(0,i-1)),t.trim()!==``&&(a=t)}if(c!==``&&(o=c),!d)return e;let f=s.length-s.trimStart().length;return e.slice(0,f)+rt(t+1)+e.slice(f)}).join(`
`)}var ot=`/str/`,st=`/files/quest/`,ct=`QuestHarness`,lt={N:0,E:1,S:2,W:3};function ut(e,t=200){let n=e.grid.map(e=>H(e)).join(`, `);return String.raw`public class Hero {
    private static final String[] GRID = { ${n} };
    private static final int START_DIR = ${lt[e.facing]};
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
`}function dt(e,t){let{name:n,params:r,returns:i}=e.method,a=r.map(e=>Ge(e.type)).join(`, `),o=r.map((e,n)=>We(e.type,t[n]??0)).join(`, `);return`call(l, ${H(e.className)}, ${H(n)}, new Class<?>[] { ${a} }, new Object[] { ${o} }, ${i===`void`})`}function ft(e){if(e.type===`hero`)return[`test(0, "", l -> hero(l));`];let t=e.grading;return t.mode===`stdio`?t.tests.map((e,t)=>`test(${t}, ${H(e.stdin)}, l -> runMain(l));`):t.tests.map((e,n)=>`test(${n}, "", l -> ${dt(t,e.args)});`)}function pt(e,t){let n=e.type===`hero`,r=ft(e).map(e=>`        ${e}`).join(`
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
    static final String DIR = ${H(st)};
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
`}function mt(e){return e.type===`hero`?[{index:0,name:`Run`,hidden:!1,hint:null}]:e.grading.tests.map((e,t)=>({index:t,name:e.name??`Test ${t+1}`,hidden:e.hidden,hint:e.hint??null}))}function ht(e,t,n){let r=e.type===`fill`?nt(e.template,t):null,i=r?r.source:t,a=tt(r?t:i,e.rules);if(a.length>0)return{kind:`rules`,failures:a};let o=`Main.java`;e.type!==`hero`&&e.grading.mode===`method`&&(o=`${e.grading.className}.java`);let s=[];return e.type===`hero`&&s.push({name:`Hero.java`,content:ut(e.level,e.maxActions)}),s.push({name:`${ct}.java`,content:pt(e,n)}),{kind:`java`,files:[{name:o,content:at(i)},...s],plainFiles:[{name:o,content:i},...s],studentFile:o,nonce:n,tests:mt(e),timeLimitMs:e.timeLimitMs,fill:r}}function gt(e){return[`-d`,st,`-cp`,ot,`-proc:none`,`-nowarn`,`-encoding`,`UTF-8`,...e.map(e=>ot+e.name)]}var _t={bridge:()=>a(()=>import(`./bridge-DWBPrDFh.js`).then(e=>e.default),[],import.meta.url)},vt={zones:[{id:`gate`,order:1,name:`The Gate`,tagline:`Say something, and remember something.`,topics:[`output`,`variables`,`data types`,`operators`,`Scanner input`],status:`locked`},{id:`crossroads`,order:2,name:`The Crossroads`,tagline:`Every path is a condition.`,topics:[`if/else`,`nested conditions`,`logical operators`,`switch`],status:`locked`},{id:`bridge`,order:3,name:`The Bridge`,tagline:`Nobody crosses by counting planks one at a time.`,topics:[`while`,`for`,`do-while`,`nested loops`,`patterns`],status:`open`,map:`bridge`,giver:{name:`Karim Majhi`},quests:[{id:`bridge-count-the-planks`,type:`predict`,title:`Count the Planks`,story:[`So you want to cross. Forty years I have kept this bridge, and every traveller is in a hurry.`,`First show me you can read a loop. My apprentice wrote this to check the planks. Tell me exactly what it prints.`],task:`Trace the code by hand and type exactly what it prints, line by line.`,concepts:[`for`,`loop counter`,`tracing`],xp:20,snippet:`int planks = 0;
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
`}]},rules:[{kind:`requires`,anyOf:[`for`,`while`],message:`An arch of any height needs loops, one inside another.`}],hints:[`One outer loop for the rows. Inside it, three small loops in a row: spaces, counting up, counting down.`,`Row r: print n - r spaces, then 1 to r, then r - 1 down to 1, then a new line.`,`Use print for the pieces of a row and a single println to end it.`]}]},{id:`library`,order:4,name:`The Library`,tagline:`Words, one character at a time.`,topics:[`strings`],status:`locked`},{id:`storehouse`,order:5,name:`The Storehouse`,tagline:`Shelves, numbered from zero.`,topics:[`arrays`,`searching`,`sorting`],status:`locked`},{id:`workshop`,order:6,name:`The Workshop`,tagline:`Build a tool once, use it everywhere.`,topics:[`methods`,`parameters`,`return`,`scope`],status:`locked`},{id:`mirror-tower`,order:7,name:`The Mirror Tower`,tagline:`A staircase that climbs itself.`,topics:[`recursion`],status:`locked`},{id:`archive`,order:8,name:`The Archive`,tagline:`What is written down outlives the program.`,topics:[`file I/O`],status:`locked`}]},W=null;function yt(){if(W)return W;let e=Ve(vt);if(!e.ok)throw Error(`Quest content is invalid: ${e.error.message}`);return W=e.value,W}function bt(e){return[...e.zones].sort((e,t)=>e.order-t.order)}function xt(e,t){for(let n of e.zones){let e=n.quests.find(e=>e.id===t);if(e)return e}return null}function G(e,t){return t.has(e.id)?`done`:e.requires.every(e=>t.has(e))?`open`:`locked`}function St(e,t){let n=0;for(let r of e.zones)for(let e of r.quests)t.has(e.id)&&(n+=e.xp);return n}function Ct({world:e,zone:t,completed:n,xp:r,onOpen:i,onClose:a}){let o=(0,E.useRef)(null);(0,E.useEffect)(()=>{o.current?.focus()},[]);let s=new Map(t.quests.map(e=>[e.id,e.title])),c=t.quests.filter(e=>n.has(e.id)).length,l=t.quests.reduce((e,t)=>e+t.xp,0);return(0,D.jsxs)(`div`,{className:`quest-panel`,role:`dialog`,"aria-modal":`true`,"aria-labelledby":`quest-log-title`,children:[(0,D.jsxs)(`div`,{className:`quest-panel-head`,children:[(0,D.jsxs)(`div`,{children:[(0,D.jsxs)(`p`,{className:`quest-kind`,children:[c,` of `,t.quests.length,` quests · `,r,` of `,l,` XP`]}),(0,D.jsxs)(`h2`,{id:`quest-log-title`,ref:o,tabIndex:-1,children:[`Quest log: `,t.name]})]}),(0,D.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:a,children:`Back`})]}),(0,D.jsxs)(`div`,{className:`quest-panel-body`,children:[(0,D.jsx)(`ol`,{className:`quest-log`,children:t.quests.map(e=>{let t=G(e,n),r=e.requires.filter(e=>!n.has(e)).map(e=>s.get(e)??e);return(0,D.jsxs)(`li`,{className:`quest-log-item quest-log-item--${t}`,children:[(0,D.jsxs)(`div`,{className:`quest-log-text`,children:[(0,D.jsxs)(`p`,{className:`quest-log-title`,children:[e.title,e.boss?(0,D.jsx)(`span`,{className:`quest-chip quest-chip--boss`,children:`Boss`}):null]}),(0,D.jsxs)(`p`,{className:`quest-log-meta`,children:[e.concepts.join(` · `),` · `,e.xp,` XP`]}),t===`locked`?(0,D.jsxs)(`p`,{className:`quest-log-meta`,children:[`Needs: `,r.join(`, `)]}):null]}),t===`locked`?(0,D.jsx)(`span`,{className:`quest-log-state`,children:`Locked`}):(0,D.jsxs)(`button`,{type:`button`,className:`quest-button${t===`open`?` quest-button--primary`:``}`,onClick:()=>i(e.id),children:[t===`done`?`Done ✓`:`Start`,(0,D.jsx)(`span`,{className:`quest-sr`,children:t===`done`?`practise ${e.title} again`:e.title})]})]},e.id)})}),(0,D.jsx)(`h3`,{className:`quest-subhead`,children:`The world`}),(0,D.jsx)(`ul`,{className:`quest-zones`,children:bt(e).map(e=>(0,D.jsxs)(`li`,{className:`quest-zone${e.id===t.id?` quest-zone--here`:``}`,children:[(0,D.jsxs)(`span`,{className:`quest-zone-name`,children:[e.order,`. `,e.name]}),(0,D.jsx)(`span`,{className:`quest-zone-note`,children:e.id===t.id?`You are here`:e.status===`open`?e.tagline:`Not built yet`})]},e.id))})]})]})}var wt=/^(?:.*[/\\])?([A-Za-z_$][\w$]*\.java):(\d+): (error|warning): (.*)$/,Tt=/^(?:\d+ (?:error|warning)s?$|Note: )/,Et=/^\s*\^\s*$/,Dt=(e,t)=>{for(let n of e){let e=RegExp(`^\\s*${t}:\\s*(.*)$`).exec(n);if(e?.[1])return e[1].trim()}return null},Ot=e=>e?/^(?:variable|method|class)\s+([\w$]+)/.exec(e)?.[1]??null:null,kt=[{when:/^';' expected/,say:()=>`A statement is missing its semicolon. Look at the end of this line, and at the end of the line just above it.`},{when:/^cannot find symbol/,say:(e,t)=>{let n=Dt(t,`symbol`),r=Ot(n);return n?.startsWith(`variable`)&&r?`Java does not know any variable called ${r}. Check the spelling and the capital letters, and that it was declared (with a type) before this line.`:n?.startsWith(`method`)&&r?`There is no method called ${r} here. Check the spelling and the capital letters: Java treats nextInt and nextint as different names.`:n?.startsWith(`class`)&&r?r===`Scanner`?`Scanner needs an import. Put import java.util.Scanner; on the first line of the file.`:`Java does not know the type ${r}. Check the capital letters: String and System start with a capital.`:`Java does not recognise a name on this line. Check its spelling and capital letters, and that it was declared before it is used.`}},{when:/^incompatible types: possible lossy conversion from (\w+) to (\w+)/,say:e=>`A ${e[1]} value cannot go into a ${e[2]} variable without losing something. Change the variable's type to ${e[1]}, or cast with (${e[2]}) if dropping the extra is what you want.`},{when:/^incompatible types: (.+) cannot be converted to (.+)$/,say:e=>`This line puts a ${e[1]} where a ${e[2]} is needed. Check the type the variable was declared with, and what is on the right of the = sign.`},{when:/^incompatible types: missing return value/,say:()=>`This method must give back a value. Write the value after the word return.`},{when:/^missing return statement/,say:()=>`This method promises to return a value, but there is a way to reach its end without a return. Add a return after the loop or if.`},{when:/^variable (\w+) might not have been initialized/,say:e=>`${e[1]} is used before it has a value. Give it a starting value where it is declared, for example int ${e[1]} = 0;`},{when:/^variable (\w+) is already defined/,say:e=>`${e[1]} was already declared above. Declare a variable once; afterwards use its name without the type.`},{when:/^reached end of file while parsing/,say:()=>`The file ends before every { has its matching }. Count the braces: each opening one needs a closing one.`},{when:/^class, interface, enum, or record expected|^class, interface, or enum expected/,say:()=>`There is code outside the class, usually because of one } too many. Check that the braces are balanced.`},{when:/^'\)' expected|^'\(' expected|^'\)' or ',' expected/,say:()=>`The brackets on this line do not match. Every ( needs a ).`},{when:/^'\{' expected|^'\}' expected/,say:()=>`A brace is missing near this line. Every { needs a }.`},{when:/^not a statement/,say:()=>`This line is not a complete instruction. A lone value or comparison does nothing; did you mean to assign it or print it?`},{when:/^unclosed string literal/,say:()=>`A piece of text is missing its closing ". Text must start and end with a double quote on the same line.`},{when:/^unclosed character literal|^empty character literal/,say:()=>`Single quotes hold exactly one character, like 'a'. For more than one character, use double quotes.`},{when:/^'else' without 'if'/,say:()=>`This else has no if to belong to. Look for a stray semicolon right after the if (...) above, or a brace in the wrong place.`},{when:/^illegal start of (expression|type)/,say:()=>`Java found something it did not expect here, often caused by a missing } or ) on an earlier line.`},{when:/^class (\w+) is public, should be declared in a file named/,say:e=>`Keep the class name the quest started with. Rename ${e[1]} back and try again.`},{when:/^non-static (method|variable) (\S+) cannot be referenced from a static context/,say:e=>`main is static, so it can only use static ${e[1]}s directly. Add the word static to ${(e[2]??``).replace(/\(.*$/,``)}.`},{when:/^unreachable statement/,say:()=>`Java can never reach this line. It comes after a return or break, or after a loop that never ends.`},{when:/^bad operand types for binary operator '(.+)'/,say:e=>`${e[1]} cannot be used between these two types. Compare numbers with numbers, and join conditions with && or ||.`},{when:/^incomparable types|cannot be compared/,say:()=>`These two values are of different kinds and cannot be compared. For text, use .equals(...) rather than ==.`},{when:/^method (\w+) in class \w+ cannot be applied to given types/,say:e=>`${e[1]} was called with the wrong number or kind of values. Compare the call with how the method is declared.`},{when:/^<identifier> expected/,say:()=>`Java expected a name here. A statement may be sitting outside any method, or a type is missing before a variable name.`},{when:/^array required, but (\w+) found/,say:e=>`Square brackets only work on arrays, and this is a ${e[1]}.`},{when:/^break outside switch or loop|^continue outside of loop/,say:()=>`break and continue only make sense inside a loop. Check where this loop's braces end.`}],At=`Read the message against this line and the one above it. Most compiler errors are a missing symbol or a misspelt name.`;function jt(e,t){for(let n of kt){let r=n.when.exec(e);if(r)return n.say(r,t)}return At}function Mt(e,t){let n=e.replace(/\r\n?/g,`
`).split(`
`),r=[],i=0;for(;i<n.length;){let e=wt.exec(n[i]??``);if(!e){i+=1;continue}let a=[];for(i+=1;i<n.length&&!wt.test(n[i]??``)&&!Tt.test((n[i]??``).trim());)a.push(n[i]??``),i+=1;let o=a.findIndex(e=>Et.test(e)),s=o===-1?null:(a[o]??``).indexOf(`^`)+1,c=o>1?a.slice(0,o-1):[],l=(o===-1?a:a.slice(o+1)).filter(e=>e.trim()),u=[e[4]??``,...c.map(e=>e.trim())].join(` `).trim(),d=e[1]??``;r.push({file:d,line:Number(e[2]),column:s,severity:e[3]===`warning`?`warning`:`error`,message:u,details:l,hint:jt(u,l),inStudentFile:d===t})}return r}var Nt={ArithmeticException:()=>`The program divided a whole number by zero. Check the value on the right of / or % before dividing.`,ArrayIndexOutOfBoundsException:()=>`The program used a position that is not in the array. Positions run from 0 to length - 1, so a loop that reaches length goes one too far.`,StringIndexOutOfBoundsException:()=>`The program asked for a character position that is not in the text. Positions run from 0 to length() - 1.`,NullPointerException:()=>`The program used a variable that holds nothing yet (null). Give it a value with new, or an assignment, before using it.`,InputMismatchException:()=>`The program read a different kind of input from what was there, for example nextInt() when the next thing is a word or a decimal.`,NoSuchElementException:()=>`The program asked for more input than there was. Check how many times the loop reads: it may be reading once too often.`,NumberFormatException:()=>`The program tried to turn text into a number, but the text is not a number.`,StackOverflowError:()=>`A method kept calling itself and never stopped. Check that it has a case where it does not call itself.`,OutOfMemoryError:()=>`The program used up all the memory, usually by adding to something inside a loop that never ends.`,NegativeArraySizeException:()=>`An array was created with a negative size. Check the number inside the [ ].`,ClassCastException:()=>`A value was treated as a type it is not.`};function Pt(e){let[t=``,n=`0`,...r]=e.split(`|`),i=t.slice(t.lastIndexOf(`.`)+1)||`Exception`,a=r.join(`|`),o=Number(n)>0?Number(n):null,s=Nt[i];return{name:i,line:o,message:a,hint:s?s(a):`The program stopped with an error while running. The line shown is where it happened.`}}var Ft={NoMainClass:`The class must be called Main. Keep the first line the quest started with.`,NoMainMethod:`Java could not find public static void main(String[] args). Keep that line exactly as it was.`,MainNotStatic:`main must be static: public static void main(String[] args).`,NoClass:`The class has been renamed. Keep the class name the quest started with.`,NoMethod:`The method the tests call is missing or its first line has changed. Keep the name, the parameters and the return type the quest started with.`,NoConstructor:`The class needs a constructor that takes no values, or make the method static.`};function It(e){return Ft[e]??`The tests could not start your program. Check that its first lines are unchanged.`}function Lt(e){let t=e.replace(/\r\n?/g,`
`).split(`
`).map(e=>e.replace(/[ \t]+$/,``));for(;t.length>0&&t[t.length-1]===``;)t.pop();return t}function Rt(e,t){let n=Lt(e),r=Lt(t),i=Math.max(n.length,r.length);for(let e=0;e<i;e+=1){let t=n[e]??null,i=r[e]??null;if(t!==i)return{pass:!1,diff:{line:e+1,expected:t,actual:i}}}return{pass:!0}}function zt(e){return e.replace(/^ +/,e=>`·`.repeat(e.length))}var Bt=[`N`,`E`,`S`,`W`],Vt=[0,1,0,-1],Ht=[-1,0,1,0],Ut={S:`step`,B:`blocked`,L:`turnLeft`,R:`turnRight`,P:`pick`,p:`pickNothing`,X:`tired`};function Wt(e){for(let t=0;t<e.grid.length;t+=1){let n=(e.grid[t]??``).indexOf(`S`);if(n>=0)return{x:n,y:t,facing:e.facing}}return{x:0,y:0,facing:e.facing}}function Gt(e,t){let n=t.split(`|`);if(n.length!==6)return null;let r=n[0]??``,i=n[5]??``,a=Wt(e),{x:o,y:s}=a,c=Bt.indexOf(a.facing),l=0,u=[];for(let e of r){let t=Ut[e];if(!t)return null;t===`step`?(o+=Vt[c]??0,s+=Ht[c]??0):t===`turnLeft`?c=(c+3)%4:t===`turnRight`?c=(c+1)%4:t===`pick`&&(l+=1),u.push({event:t,x:o,y:s,facing:Bt[c]??`N`,picked:l})}let d=i===`blocked`||i===`tired`||i===`dizzy`?i:null,f=e.grid.join(``).split(`*`).length-1;return{start:a,frames:u,stop:d,reachedGoal:(e.grid[s]??``).charAt(o)===`G`,picked:l,totalItems:f}}function Kt(e,t){if(t.stop===`blocked`)return{passed:!1,message:`The hero walked into something that cannot be crossed.`};if(t.stop===`tired`)return{passed:!1,message:`The hero is worn out after ${e.maxActions} actions. A loop may be running longer than it should.`};if(t.stop===`dizzy`)return{passed:!1,message:`The hero kept looking around and never moved. Something inside the loop has to change what the loop is checking.`};if(e.goal.reach&&!t.reachedGoal)return{passed:!1,message:`The code finished, but the hero is not at the goal yet.`};if(e.goal.collectAll&&t.picked<t.totalItems){let e=t.totalItems-t.picked;return{passed:!1,message:`The hero reached the end but left ${e} item${e===1?``:`s`} behind.`}}return{passed:!0,message:`The hero made it.`}}var K=(e,t,n)=>({index:e.index,name:e.name,hidden:e.hidden,outcome:t,message:n,input:null,expected:null,actual:null,diff:null,problem:null,hint:t===`pass`?null:e.hint}),qt=e=>{let t=e/1e3;return`${Number.isInteger(t)?t:t.toFixed(1)} second${t===1?``:`s`}`};function Jt(e){return e.line===null?`${e.name}.`:`${e.name} at line ${e.line}.`}function Yt(e,t){if(e.type===`hero`)return{input:null,expected:null};let n=e.grading;if(n.mode===`stdio`){let e=n.tests[t];return{input:e?.stdin??null,expected:e?.expected??null}}let r=n.tests[t];if(!r)return{input:null,expected:null};let{name:i,params:a,returns:o}=n.method,s=a.map((e,t)=>Ke(e.type,r.args[t]??0)).join(`, `),c=o!==`void`&&r.expected!==void 0?Ke(o,r.expected):r.expectedStdout??null;return{input:`${i}(${s})`,expected:c}}function Xt(e,t,n){if(e.type===`hero`){let r=Gt(e.level,n.extra);if(!r)return{verdict:K(t,`error`,`The run left nothing to replay.`),hero:null};let i=Kt(e,r);return{verdict:K(t,i.passed?`pass`:`fail`,i.passed?null:i.message),hero:r}}let r=t.hidden?{input:null,expected:null}:Yt(e,t.index),i=e.grading;if(i.mode===`stdio`){let e=i.tests[t.index],a=Rt(e?.expected??``,n.out);return a.pass?{verdict:{...K(t,`pass`,null),...r},hero:null}:{verdict:{...K(t,`fail`,t.hidden?`A hidden test printed the wrong output.`:`Line ${a.diff.line} of the output is different.`),...r,actual:t.hidden?null:n.out,diff:t.hidden?null:a.diff},hero:null}}let a=i.tests[t.index],{returns:o}=i.method,s=o===`void`||a?.expected===void 0||Xe(o,a.expected,n.extra),c=a?.expectedStdout===void 0?{pass:!0}:Rt(a.expectedStdout,n.out);if(s&&c.pass)return{verdict:{...K(t,`pass`,null),...r},hero:null};let l=`A hidden test got the wrong answer.`,u=null,d=null;return t.hidden||(s?c.pass||(u=n.out,d=c.diff,l=`Line ${c.diff.line} of what it printed is different.`):(u=qe(o,n.extra),l=`Returned ${u}, expected ${r.expected??`something else`}.`)),{verdict:{...K(t,`fail`,l),...r,actual:u,diff:d},hero:null}}function Zt(e,t,n,r){let i=new Map(n.map(e=>[e.index,e])),a=null,o=!1,s=t.tests.map(n=>{let s=i.get(n.index);if(!s)return o||r.kind===`done`?K(n,`notRun`,`Not run.`):(o=!0,r.kind===`timeout`?K(n,`timeout`,`Stopped after ${qt(t.timeLimitMs)}. A loop is probably never ending: check that something inside it changes its condition.`):K(n,`error`,`The program ended before the tests finished. System.exit() stops everything, including the tests.`));if(s.status===`SETUP`)return K(n,`error`,It(s.detail));if(s.status===`OLE`)return K(n,`error`,`The program printed far more than any answer needs. A loop that prints is probably never ending.`);if(s.status===`EXC`){let t=Pt(s.detail);e.type===`hero`&&(a=Gt(e.level,s.extra));let r=n.hidden?{input:null,expected:null}:Yt(e,n.index);return{...K(n,`error`,Jt(t)),...r,problem:t}}let c=Xt(e,n,s);return c.hero&&(a=c.hero),c.verdict}),c=s.filter(e=>e.outcome===`pass`).length,l=c===s.length,u=e.type===`hero`?s[0]?.message??`The hero made it.`:l?`All ${s.length} tests passed.`:`${c} of ${s.length} tests passed.`;return{kind:`tests`,passed:l,tests:s,hero:a,summary:u}}function Qt(e,t){let n=Rt(e.answer,t);return{kind:`predict`,passed:n.pass,wrongLine:n.pass?null:n.diff.line}}function $t(e){return{kind:`rules`,passed:!1,failures:e}}function en(e,t){return{kind:`compile`,passed:!1,diagnostics:e,raw:t}}function tn(){let e=new Uint8Array(8);return globalThis.crypto.getRandomValues(e),Array.from(e,e=>e.toString(16).padStart(2,`0`)).join(``)}async function nn(e,t,n,r={}){if(t.type===`predict`)return Qt(t,n);let i=ht(t,n,tn());if(i.kind===`rules`)return $t(i.failures);let a=await e.run(i,r);return a.kind===`engineError`?{kind:`engine`,passed:!1,message:a.message}:a.kind===`compileError`?en(Mt(a.output,i.studentFile),a.output):Zt(t,i,a.results,a.ending)}var q=2,J=16*q,rn=230;function an(e,t,n){return{backgroundImage:`url(${e})`,backgroundSize:`${t.width*q}px ${t.height*q}px`,backgroundPosition:`-${n.column*17*q}px -${n.row*17*q}px`}}function on(e){let t=[...e].reverse(),{width:n,height:r}=P;return{backgroundImage:t.map(()=>`url(${O})`).join(`, `),backgroundSize:t.map(()=>`${n*q}px ${r*q}px`).join(`, `),backgroundPosition:t.map(e=>`-${e.column*17*q}px -${e.row*17*q}px`).join(`, `),backgroundRepeat:`no-repeat`}}var sn=(e,t)=>({left:e*J,top:t*J}),cn={N:`up`,E:`right`,S:`down`,W:`left`};function ln({level:e,run:t}){let[n,r]=(0,E.useState)(0),[i,a]=(0,E.useState)(0);(0,E.useEffect)(()=>{if(!t)return;let e=t.frames.length,n=typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,i=n?e:0,a=window.setTimeout(()=>r(i),0);if(n||e===0)return()=>window.clearTimeout(a);let o=window.setInterval(()=>{i+=1,r(i),i>=e&&window.clearInterval(o)},rn);return()=>{window.clearTimeout(a),window.clearInterval(o)}},[t,i]);let o=e.grid,s=o[0]?.length??0,c=t?t.frames.slice(0,Math.min(n,t.frames.length)):[],l=c[c.length-1],u=t?.start??Wt(e),d=l??u,f=new Set;for(let e of c)e.event===`pick`&&f.add(`${e.x},${e.y}`);let p=o.join(``).split(`*`).length-1,m=t!==null&&t.frames.length>0&&n>=t.frames.length,h=l?.event===`blocked`;return(0,D.jsxs)(`div`,{className:`quest-board-wrap`,children:[(0,D.jsxs)(`div`,{className:`quest-board`,role:`img`,"aria-label":`The hero's board, ${s} squares by ${o.length}. The hero is at column ${d.x+1}, row ${d.y+1}, facing ${cn[d.facing]}, holding ${f.size} of ${p}.`,style:{width:s*J,height:o.length*J},children:[o.flatMap((e,t)=>[...e].map((e,n)=>(0,D.jsx)(`span`,{className:`quest-board-tile`,style:{...sn(n,t),...an(k,N,e===`#`?F.wall:F.floor)}},`${n},${t}`))),o.flatMap((e,t)=>[...e].flatMap((e,n)=>e===`G`?[(0,D.jsx)(`span`,{className:`quest-board-tile`,style:{...sn(n,t),...an(k,N,F.goal)}},`goal ${n},${t}`)]:e===`*`&&!f.has(`${n},${t}`)?[(0,D.jsx)(`span`,{className:`quest-board-tile`,style:{...sn(n,t),...an(k,N,F.item)}},`item ${n},${t}`)]:[])),(0,D.jsx)(`span`,{className:`quest-board-hero${h?` quest-board-hero--bumped`:``}`,"data-facing":d.facing,style:{transform:`translate(${d.x*J}px, ${d.y*J}px)`,...on(j.hero)}})]}),(0,D.jsxs)(`p`,{className:`quest-board-caption`,children:[`Holding `,f.size,` of `,p,m?(0,D.jsxs)(D.Fragment,{children:[` · `,(0,D.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:()=>a(e=>e+1),children:`Watch again`})]}):null]})]})}var un={pass:`✓`,fail:`✗`,error:`✗`,timeout:`⏱`,notRun:`·`},dn={pass:`passed`,fail:`wrong answer`,error:`stopped with an error`,timeout:`ran out of time`,notRun:`not run`};function fn({label:e,text:t}){return(0,D.jsxs)(`div`,{className:`quest-io`,children:[(0,D.jsx)(`span`,{className:`quest-io-label`,children:e}),(0,D.jsx)(`pre`,{className:`quest-io-text`,tabIndex:0,"aria-label":e,children:t===``?`(nothing)`:t})]})}function pn({text:e}){return e===null?(0,D.jsx)(`em`,{children:`no line`}):(0,D.jsx)(`code`,{children:zt(e)})}function mn({diagnostic:e}){return(0,D.jsxs)(`li`,{className:`quest-problem`,children:[(0,D.jsx)(`p`,{className:`quest-problem-where`,children:e.inStudentFile?`Line ${e.line}`:`In the code around yours`}),(0,D.jsx)(`p`,{className:`quest-problem-hint`,children:e.hint}),(0,D.jsx)(`pre`,{className:`quest-problem-raw`,children:[e.message,...e.details].join(`
`)})]})}function hn({test:e,bare:t=!1}){let n=e.outcome!==`pass`&&e.outcome!==`notRun`;return(0,D.jsxs)(`li`,{className:`quest-test quest-test--${e.outcome}`,children:[t?null:(0,D.jsxs)(`p`,{className:`quest-test-head`,children:[(0,D.jsx)(`span`,{className:`quest-test-mark`,"aria-hidden":`true`,children:un[e.outcome]}),(0,D.jsx)(`span`,{className:`quest-test-name`,children:e.name}),(0,D.jsx)(`span`,{className:`quest-test-outcome`,children:dn[e.outcome]})]}),n&&e.message&&!t?(0,D.jsx)(`p`,{className:`quest-test-message`,children:e.message}):null,n&&e.problem?(0,D.jsxs)(`p`,{className:`quest-problem-hint`,children:[e.problem.line===null?``:`Line ${e.problem.line}: `,e.problem.hint]}):null,n&&e.hint?(0,D.jsxs)(`p`,{className:`quest-test-hint`,children:[`Hint: `,e.hint]}):null,n&&!e.hidden?(0,D.jsxs)(`div`,{className:`quest-io-grid`,children:[e.input!==null&&e.input!==``?(0,D.jsx)(fn,{label:`Input`,text:e.input}):null,e.expected===null?null:(0,D.jsx)(fn,{label:`Expected`,text:e.expected}),e.actual===null?null:(0,D.jsx)(fn,{label:`Your program`,text:e.actual}),e.diff?(0,D.jsxs)(`p`,{className:`quest-test-diff`,children:[`First difference on line `,e.diff.line,`. Expected `,(0,D.jsx)(pn,{text:e.diff.expected}),`, got `,(0,D.jsx)(pn,{text:e.diff.actual}),`. A `,(0,D.jsx)(`code`,{children:`·`}),` is a space.`]}):null]}):null]})}function gn({result:e}){if(e.kind===`engine`)return(0,D.jsxs)(`div`,{className:`quest-verdict quest-verdict--engine`,role:`status`,children:[(0,D.jsx)(`p`,{className:`quest-verdict-title`,children:`The Java engine had a problem`}),(0,D.jsx)(`p`,{children:e.message}),(0,D.jsx)(`p`,{children:`Your code was not judged. Run it again.`})]});if(e.kind===`rules`)return(0,D.jsxs)(`div`,{className:`quest-verdict quest-verdict--fail`,role:`status`,children:[(0,D.jsx)(`p`,{className:`quest-verdict-title`,children:`Not yet: the quest asks for something else`}),(0,D.jsx)(`ul`,{className:`quest-plain-list`,children:e.failures.map(e=>(0,D.jsx)(`li`,{children:e},e))})]});if(e.kind===`compile`){let t=e.diagnostics.filter(e=>e.severity===`error`).length;return(0,D.jsxs)(`div`,{className:`quest-verdict quest-verdict--fail`,role:`status`,children:[(0,D.jsxs)(`p`,{className:`quest-verdict-title`,children:[t===1?`Java found 1 problem`:`Java found ${t||`some`} problems`,` before it could run your code`]}),e.diagnostics.length>0?(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(`p`,{children:`Fix the first one first: one mistake often causes the rest.`}),(0,D.jsx)(`ul`,{className:`quest-plain-list`,children:e.diagnostics.map((e,t)=>(0,D.jsx)(mn,{diagnostic:e},`${e.line}-${t}`))})]}):(0,D.jsx)(`pre`,{className:`quest-problem-raw`,children:e.raw})]})}return e.kind===`predict`?(0,D.jsx)(`div`,{className:`quest-verdict ${e.passed?`quest-verdict--pass`:`quest-verdict--fail`}`,role:`status`,children:(0,D.jsx)(`p`,{className:`quest-verdict-title`,children:e.passed?`That is exactly what it prints.`:e.wrongLine===null?`Not quite. Trace it again, one pass of the loop at a time.`:`Not quite. Line ${e.wrongLine} of your answer is not what the program prints there.`})}):(0,D.jsxs)(`div`,{className:`quest-verdict ${e.passed?`quest-verdict--pass`:`quest-verdict--fail`}`,role:`status`,children:[(0,D.jsx)(`p`,{className:`quest-verdict-title`,children:e.summary}),(0,D.jsx)(`ul`,{className:`quest-plain-list`,children:e.tests.map(t=>(0,D.jsx)(hn,{test:t,bare:e.hero!==null},t.index))})]})}function _n(e){return e?e.kind===`compile`?e.diagnostics.filter(e=>e.inStudentFile).map(e=>e.line):e.kind===`tests`?e.tests.flatMap(e=>e.problem&&e.problem.line!==null?[e.problem.line]:[]):[]:[]}var vn=()=>typeof window>`u`?void 0:window.__shohojQuestRunner,yn={phase:`idle`},bn=`Running Java is not set up on this copy of Shohoj, so code cannot be run here.`,xn=`The Java engine could not be downloaded. Check your connection and try again.`,Y={status:yn,warm:!1},X=null,Z=null,Sn=null,Q=new Set;function Cn(e){if(e!==Sn){X?.dispose(),X=null,Z=null,Sn=e,Y={status:yn,warm:!1};for(let e of Q)e()}}function $(e){Y={status:e,warm:Y.warm||e.phase===`ready`};for(let e of Q)e()}var wn=class extends Error{};function Tn(){if(Z)return Z;let e=Sn;if(e===null)return $({phase:`failed`,message:bn}),Promise.reject(new wn(bn));$({phase:`loading`,step:`starting`,done:0,total:0});let t=a(async()=>{let{createJavaEngine:e}=await import(`./createEngine-rL6nOCAL.js`);return{createJavaEngine:e}},[],import.meta.url).then(({createJavaEngine:n})=>{let r=n(e);return Z===t&&(X=r,r.subscribe($)),r});return Z=t,t.catch(()=>{Z===t&&(Z=null,$({phase:`failed`,message:xn}))}),t}function En(){vn()||Tn().then(e=>void e.load().catch(()=>void 0),()=>void 0)}function Dn(){X?.dispose()}var On={run:async(e,t)=>{let n=vn();if(n)return n.run(e,t);let r;try{r=await Tn()}catch(e){return{kind:`engineError`,message:e instanceof wn?bn:xn}}return r.run(e,t)}},kn=e=>(Q.add(e),()=>{Q.delete(e)});function An(){return(0,E.useSyncExternalStore)(kn,()=>Y)}function jn(){return navigator.connection?.saveData===!0}var Mn=(0,E.lazy)(()=>a(()=>import(`./CodeEditor-DB5d0ZxW.js`),__vite__mapDeps([0,1]),import.meta.url)),Nn={predict:`Predict the output`,fill:`Fill in the missing line`,fix:`Fix the bug`,write:`Write the code`,hero:`Command the hero`};function Pn(e){return e.type===`write`||e.type===`fix`||e.type===`hero`?e.starter:``}function Fn({status:e,warm:t,running:n,testNumber:r,testCount:i,held:a,onStart:o}){if(a&&e.phase===`idle`)return(0,D.jsxs)(`p`,{className:`quest-engine`,children:[`Running Java needs a one-time download of about 14 MB.`,` `,(0,D.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:o,children:`Download it now`})]});if(e.phase===`failed`)return(0,D.jsxs)(`p`,{className:`quest-engine quest-engine--failed`,role:`status`,children:[e.message,` `,(0,D.jsx)(`button`,{type:`button`,className:`quest-link`,onClick:o,children:`Try again`})]});if(e.phase===`loading`&&t)return(0,D.jsx)(`p`,{className:`quest-engine`,role:`status`,children:`Restarting the Java engine. This takes a few seconds.`});if(e.phase===`loading`){let t=e.step===`downloading`&&e.total>0?Math.round(e.done/e.total*100):null;return(0,D.jsxs)(`div`,{className:`quest-engine`,role:`status`,children:[(0,D.jsxs)(`p`,{children:[e.step===`warming`?`Almost ready: starting the Java compiler…`:t===null?`Getting the Java engine (about 14 MB, once)…`:`Getting the Java engine (about 14 MB, once): ${t}%`,n?` Your code runs as soon as it is ready.`:` You can keep reading, or go back and explore.`]}),(0,D.jsx)(`progress`,{className:`quest-progress`,"aria-label":`Java engine download`,...t===null?{}:{value:t,max:100}})]})}return n?(0,D.jsx)(`p`,{className:`quest-engine`,role:`status`,children:r===null?`Compiling your code…`:`Running test ${r} of ${i}…`}):null}function In({quest:e,alreadySolved:t,draft:n,onDraft:r,onSolved:i,onClose:a}){let[o]=(0,E.useState)(t),[s,c]=(0,E.useState)(()=>n??Pn(e)),[l,u]=(0,E.useState)(null),[d,f]=(0,E.useState)(!1),[p,m]=(0,E.useState)(null),[h,g]=(0,E.useState)(0),[_,v]=(0,E.useState)(()=>e.type!==`predict`&&jn()),{status:y,warm:b}=An(),x=(0,E.useRef)(null),S=(0,E.useRef)(null),C=(0,E.useRef)(!0),w=e.type!==`predict`;(0,E.useEffect)(()=>(C.current=!0,S.current?.focus(),w&&!jn()&&En(),()=>{C.current=!1}),[w]);let T=e=>{c(e),r(e)},ee=e.type===`hero`?1:e.type===`predict`?0:e.grading.tests.length,O=async()=>{if(d)return;f(!0),v(!1),m(null);let t=await nn(On,e,s,{onTestBegin:e=>{C.current&&m(e+1)}});t.passed&&i(),C.current&&(u(t),f(!1),window.setTimeout(()=>x.current?.scrollIntoView({block:`nearest`}),0))},k=(0,E.useMemo)(()=>_n(l),[l]),A=l?.passed===!0,j=e.hints,M=l?.kind===`tests`?l.hero:null,N;if(e.type===`predict`)N=(0,D.jsxs)(D.Fragment,{children:[(0,D.jsx)(`pre`,{className:`quest-code`,"aria-label":`The code to trace`,tabIndex:0,children:e.snippet}),(0,D.jsx)(`label`,{className:`quest-label`,htmlFor:`quest-predict`,children:`What it prints`}),(0,D.jsx)(`textarea`,{id:`quest-predict`,className:`quest-textarea`,rows:Math.min(10,Math.max(3,e.answer.split(`
`).length)),value:s,onChange:e=>T(e.target.value),autoCapitalize:`off`,autoCorrect:`off`,spellCheck:!1})]});else if(e.type===`fill`){let t=e.template.replace(/\n$/,``).split(`
`);N=(0,D.jsx)(`div`,{className:`quest-code quest-code--lines`,role:`group`,"aria-label":`The program`,children:t.map((e,t)=>{let n=(0,D.jsx)(`span`,{className:`quest-code-number`,children:t+1});return e.trim()===`__BLANK__`?(0,D.jsxs)(`div`,{className:`quest-code-line quest-code-line--blank`,children:[n,(0,D.jsx)(`span`,{children:/^\s*/.exec(e)?.[0]}),(0,D.jsx)(`input`,{className:`quest-fill`,"aria-label":`The missing line, line ${t+1}`,placeholder:`write the missing line`,value:s,onChange:e=>T(e.target.value),onKeyDown:e=>{e.key===`Enter`&&O()},autoCapitalize:`off`,autoCorrect:`off`,spellCheck:!1})]},t):(0,D.jsxs)(`div`,{className:`quest-code-line`,children:[n,(0,D.jsx)(`span`,{children:e===``?` `:e})]},t)})})}else N=(0,D.jsxs)(D.Fragment,{children:[e.type===`hero`?(0,D.jsx)(ln,{level:e.level,run:M}):null,(0,D.jsx)(E.Suspense,{fallback:(0,D.jsx)(`p`,{className:`quest-engine`,children:`Opening the editor…`}),children:(0,D.jsx)(Mn,{value:s,onChange:T,errorLines:k,label:`Your Java code for ${e.title}`})})]});return(0,D.jsxs)(`div`,{className:`quest-panel`,role:`dialog`,"aria-modal":`true`,"aria-labelledby":`quest-panel-title`,children:[(0,D.jsxs)(`div`,{className:`quest-panel-head`,children:[(0,D.jsxs)(`div`,{children:[(0,D.jsxs)(`p`,{className:`quest-kind`,children:[Nn[e.type],` · `,e.xp,` XP`,e.boss?` · Boss`:``]}),(0,D.jsx)(`h2`,{id:`quest-panel-title`,ref:S,tabIndex:-1,children:e.title})]}),(0,D.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:a,children:`Back`})]}),(0,D.jsxs)(`div`,{className:`quest-panel-body`,children:[(0,D.jsxs)(`details`,{className:`quest-story`,children:[(0,D.jsx)(`summary`,{children:`The story so far`}),e.story.map(e=>(0,D.jsx)(`p`,{children:e},e))]}),(0,D.jsx)(`p`,{className:`quest-task`,children:e.task}),o&&!A?(0,D.jsx)(`p`,{className:`quest-note`,children:`You have solved this one. Solve it again for practice: its XP counts once.`}):null,N,w?(0,D.jsx)(Fn,{status:y,warm:b,running:d,testNumber:p,testCount:ee,held:_,onStart:()=>{v(!1),En()}}):null,(0,D.jsxs)(`div`,{ref:x,children:[l?(0,D.jsx)(gn,{result:l}):null,A?(0,D.jsxs)(`div`,{className:`quest-solved`,children:[(0,D.jsx)(`p`,{className:`quest-solved-title`,children:o?`Solved again.`:`Solved. +${e.xp} XP`}),e.type===`predict`?(0,D.jsx)(`p`,{children:e.explanation}):null,(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,onClick:a,children:`Back to the zone`})]}):null]}),j.length>0&&!A?(0,D.jsxs)(`div`,{className:`quest-hints`,children:[j.slice(0,h).map((e,t)=>(0,D.jsxs)(`p`,{className:`quest-hint`,children:[(0,D.jsxs)(`strong`,{children:[`Hint `,t+1,`.`]}),` `,e]},e)),h<j.length?(0,D.jsxs)(`button`,{type:`button`,className:`quest-link`,onClick:()=>g(e=>e+1),children:[h===0?`Show a hint`:`Show another hint`,` (`,h,` of`,` `,j.length,` shown)`]}):null]}):null]}),(0,D.jsxs)(`div`,{className:`quest-panel-foot`,children:[e.type===`write`||e.type===`fix`||e.type===`hero`?(0,D.jsx)(`button`,{type:`button`,className:`quest-button`,disabled:d||s===e.starter,onClick:()=>{window.confirm(`Put the starting code back? What you typed will be lost.`)&&T(e.starter)},children:`Start again`}):null,(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,disabled:d,onClick:()=>void O(),children:d?`Running…`:e.type===`predict`?`Check`:`Run`})]})]})}function Ln(){try{return new URLSearchParams(window.location.search).get(`quest3d`)===`1`}catch{return!1}}var Rn=T(),zn=C();function Bn({store:e=Rn,drafts:t=zn,javaSandboxUrl:n=null,onLeave:r}){(0,E.useEffect)(()=>{Cn(n)},[n]);let i=(0,E.useMemo)(()=>yt(),[]),a=(0,E.useMemo)(()=>bt(i).find(e=>e.status===`open`)??null,[i]);return a?(0,D.jsx)(Vn,{zone:a,store:e,drafts:t,onLeave:r}):(0,D.jsxs)(`section`,{className:`shell-page`,children:[(0,D.jsx)(`h1`,{children:`Shohoj Quest`}),(0,D.jsx)(`p`,{className:`shell-muted`,children:`No zone is open yet.`})]})}function Vn({zone:e,store:t,drafts:n,onLeave:r}){let o=(0,E.useMemo)(()=>yt(),[]),[s,c]=(0,E.useState)(null),[l,u]=(0,E.useState)({kind:`world`}),[d,f]=(0,E.useState)(`loading`),[p,m]=(0,E.useState)(0),h=(0,E.useRef)(null),g=(0,E.useRef)(null);(0,E.useEffect)(()=>{let n=!0,r=t=>{n&&c(n=>n??(t?S(t,e.id):y(e.id)))};t.load().then(r,()=>r(null));let i=t.onRemote?.(t=>{n&&c(n=>n?b(n,t):S(t,e.id))});return()=>{n=!1,i?.()}},[t,e.id]),(0,E.useEffect)(()=>{s&&t.save(s)},[s,t]),(0,E.useEffect)(()=>{let e=()=>{document.visibilityState===`hidden`&&(t.flush?.(),n.flush())};return document.addEventListener(`visibilitychange`,e),()=>{document.removeEventListener(`visibilitychange`,e),n.flush()}},[t,n]);let _=(0,E.useMemo)(()=>s?w(s):new Set,[s]),C=(0,E.useMemo)(()=>({completed:_,open:new Set(e.quests.filter(e=>G(e,_)===`open`).map(e=>e.id))}),[_,e]),T=St(o,_),O=e.quests.filter(e=>_.has(e.id)).length,k=e.giver?.name??`The quest-giver`,A=(0,E.useCallback)(e=>{let t=G(e,_);if(t===`locked`){let t=e.requires.filter(e=>!_.has(e)).map(e=>xt(o,e)?.title??e);u({kind:`notice`,text:`Not yet. "${e.title}" needs you to finish ${t.join(` and `)} first.`})}else t===`open`&&u({kind:`talk`,questId:e.id,line:0})},[_,o]),j=(0,E.useCallback)(t=>{switch(t.kind){case`ready`:f(`ready`);break;case`failed`:f(`failed`);break;case`moved`:c(e=>e&&x(e,t.at));break;case`giver`:{let t=e.quests.find(e=>G(e,_)===`open`);t?A(t):u({kind:`notice`,text:`There is nothing left for me to teach you here. The far gate is open: the road north is yours.`});break}case`gate`:{let n=e.quests.find(e=>e.id===t.quest);n&&A(n);break}case`exit`:u({kind:`cleared`})}},[_,A,e]),M=(0,E.useRef)({onZoneEvent:j,zoneState:C,paused:l.kind!==`world`,progress:s});(0,E.useEffect)(()=>{M.current={onZoneEvent:j,zoneState:C,paused:l.kind!==`world`,progress:s}});let N=s!==null;(0,E.useEffect)(()=>{let t=h.current,n=e.map?_t[e.map]:void 0;if(!N||!t)return;let r=!0,i=null;return(async()=>{if(!n)throw Error(`no map is registered for "${e.map??``}"`);let o=await n(),s=re(o);if(!s.ok)throw Error(s.error.join(` `));if(!r)return;let c={parent:t,mapJson:o,map:s.value,state:M.current.zoneState,start:M.current.progress?.at??null,onEvent:e=>M.current.onZoneEvent(e)};if(i=null,Ln())try{let{createZoneGame:e}=await a(async()=>{let{createZoneGame:e}=await import(`./zoneGame3d-26YGU0DD.js`);return{createZoneGame:e}},__vite__mapDeps([2,3]),import.meta.url);if(!r)return;i=e(c)}catch{i=null}if(!i){let{createZoneGame:e}=await a(async()=>{let{createZoneGame:e}=await import(`./zoneGame-D6SByhX0.js`);return{createZoneGame:e}},[],import.meta.url);if(!r)return;i=e(c)}i.setPaused(M.current.paused),g.current=i})().catch(()=>{r&&f(`failed`)}),()=>{r=!1,g.current=null,i?.destroy()}},[N,e.map,p]),(0,E.useEffect)(()=>{g.current?.setState(C)},[C]);let P=l.kind!==`world`;(0,E.useEffect)(()=>{g.current?.setPaused(P)},[P]);let te=(0,E.useRef)(null);(0,E.useEffect)(()=>{let e=document.documentElement;e.classList.add(`quest-open`);let t=window.visualViewport,n=()=>{t&&te.current?.style.setProperty(`--quest-height`,`${t.height}px`)};return n(),t?.addEventListener(`resize`,n),()=>{e.classList.remove(`quest-open`),t?.removeEventListener(`resize`,n),Dn()}},[]),(0,E.useEffect)(()=>{if(l.kind===`world`)return;let e=e=>{e.key===`Escape`&&(e.target instanceof Element&&e.target.closest(`.cm-editor`)||u({kind:`world`}))};return window.addEventListener(`keydown`,e),()=>window.removeEventListener(`keydown`,e)},[l.kind]);let F=()=>u({kind:`world`}),I=(0,E.useMemo)(()=>typeof window.matchMedia==`function`&&window.matchMedia(`(pointer: coarse)`).matches,[]),L=l.kind===`quest`?xt(o,l.questId):null,R=l.kind===`talk`?xt(o,l.questId):null;return(0,ee.createPortal)((0,D.jsxs)(`div`,{className:`quest-root`,ref:te,children:[(0,D.jsxs)(`div`,{className:`quest-hud`,children:[r?(0,D.jsx)(`button`,{type:`button`,className:`quest-hud-back`,"aria-label":`Leave the game, back to Shohoj`,onClick:r,children:`← Shohoj`}):(0,D.jsx)(i,{to:`/`,className:`quest-hud-back`,"aria-label":`Leave the game, back to Shohoj`,children:`← Shohoj`}),(0,D.jsx)(`h1`,{className:`quest-hud-title`,children:e.name}),(0,D.jsxs)(`span`,{className:`quest-hud-xp`,"aria-label":`${T} experience points`,children:[T,` XP`]}),(0,D.jsxs)(`button`,{type:`button`,className:`quest-button`,onClick:()=>u({kind:`log`}),"aria-haspopup":`dialog`,children:[`Quests `,O,`/`,e.quests.length]})]}),(0,D.jsxs)(`div`,{className:`quest-stage`,ref:h,"aria-hidden":P?`true`:void 0,children:[d===`loading`?(0,D.jsxs)(`p`,{className:`quest-stage-note`,children:[`Loading `,e.name,`…`]}):null,d===`failed`?(0,D.jsxs)(`div`,{className:`quest-stage-note`,role:`alert`,children:[(0,D.jsx)(`p`,{children:`The zone could not be loaded. Check your connection.`}),(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,onClick:()=>{f(`loading`),m(e=>e+1)},children:`Try again`})]}):null]}),l.kind===`world`&&d===`ready`?(0,D.jsx)(`p`,{className:`quest-tip`,children:O===0?`${I?`Tap where you want to walk.`:`Click where you want to walk, or use the arrow keys.`} ${k} is waiting by the bridge.`:O===e.quests.length?`The far gate is open. Take the road north.`:`Walk up to a marked part of the bridge to work on it, or open Quests.`}):null,(0,D.jsxs)(`p`,{className:`quest-credit`,children:[(0,D.jsx)(`a`,{href:`https://cheerpj.com/`,target:`_blank`,rel:`noreferrer`,children:`Built with CheerpJ`}),(0,D.jsx)(`span`,{children:` · `}),(0,D.jsx)(`a`,{href:`https://kenney.nl/`,target:`_blank`,rel:`noreferrer`,children:`Art by Kenney`})]}),l.kind===`talk`&&R?(0,D.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`${k} speaks`,children:[(0,D.jsx)(`p`,{className:`quest-dialog-speaker`,children:k}),(0,D.jsx)(`p`,{className:`quest-dialog-text`,"aria-live":`polite`,children:R.story[l.line]}),(0,D.jsxs)(`div`,{className:`quest-dialog-actions`,children:[(0,D.jsx)(`button`,{type:`button`,className:`quest-button`,onClick:F,children:`Not now`}),l.line<R.story.length-1?(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:()=>u({...l,line:l.line+1}),children:`Next`}):(0,D.jsxs)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:()=>u({kind:`quest`,questId:R.id}),children:[`Take the quest: `,R.title]})]})]}):null,l.kind===`notice`?(0,D.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`${k} speaks`,children:[(0,D.jsx)(`p`,{className:`quest-dialog-speaker`,children:k}),(0,D.jsx)(`p`,{className:`quest-dialog-text`,children:l.text}),(0,D.jsx)(`div`,{className:`quest-dialog-actions`,children:(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:F,children:`All right`})})]}):null,l.kind===`cleared`?(0,D.jsxs)(`div`,{className:`quest-dialog`,role:`dialog`,"aria-label":`Zone complete`,children:[(0,D.jsxs)(`p`,{className:`quest-dialog-speaker`,children:[`You crossed `,e.name]}),(0,D.jsxs)(`p`,{className:`quest-dialog-text`,children:[T,` XP earned. The road goes on, but the next place is not built yet. Every quest here can be solved again from the quest log.`]}),(0,D.jsx)(`div`,{className:`quest-dialog-actions`,children:(0,D.jsx)(`button`,{type:`button`,className:`quest-button quest-button--primary`,autoFocus:!0,onClick:F,children:`Keep exploring`})})]}):null,L?(0,D.jsx)(`div`,{className:`quest-sheet`,children:(0,D.jsx)(In,{quest:L,alreadySolved:_.has(L.id),draft:n.get(L.id),onDraft:e=>n.set(L.id,e),onSolved:()=>c(e=>e&&v(e,L.id,Date.now())),onClose:F},L.id)}):null,l.kind===`log`?(0,D.jsx)(`div`,{className:`quest-sheet`,children:(0,D.jsx)(Ct,{world:o,zone:e,completed:_,xp:T,onOpen:e=>u({kind:`quest`,questId:e}),onClose:F})}):null]}),document.body)}export{Bn as QuestScreen,ce as a,ie as c,P as d,te as f,O as g,k as h,gt as i,ae as l,M as m,ct as n,ue as o,j as p,ot as r,oe as s,st as t,se as u};