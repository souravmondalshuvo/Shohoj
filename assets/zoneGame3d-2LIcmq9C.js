import{A as e,C as t,Ct as n,D as r,Ft as i,I as a,M as o,Mt as s,N as c,O as l,Pt as u,Vt as d,Zt as f,_ as p,_t as m,an as h,c as g,d as _,gt as ee,h as v,j as y,jt as b,kt as te,l as ne,m as re,mt as ie,n as ae,nn as x,nt as S,r as oe,rt as C,st as w,t as se,tn as T,tt as ce,u as le,vt as E,w as ue,y as D}from"./three.module-B7o_1O-j.js";import{a as O,c as k,i as de,l as fe,n as pe,o as me,r as he,s as ge,t as _e}from"./RenderPass-DcnTT54b.js";import{i as A,n as ve,o as ye,r as j,s as M,t as N}from"./zoneMap-CsWmf2aA.js";var P=57,F=(e,t)=>`${e},${t}`,be=new Set([F(0,0),F(1,0)]),xe=F(2,1),Se=F(4,1),Ce=(e,t)=>e>=5&&e<=9&&t>=19&&t<=24,we=(e,t)=>e>=5&&e<=9&&t>=7&&t<=12||F(e,t)===F(6,0),I=new Map([[F(13,11),[`tree`,0]],[F(15,11),[`tree`,1]],[F(14,11),[`krishnachura`,0]],[F(16,9),[`pine`,0]],[F(18,9),[`pine`,1]],[F(23,10),[`fruit-tree`,0]],[F(23,11),[`fruit-tree`,1]],[F(19,9),[`bush`,0]],[F(21,9),[`bush`,1]],[F(25,9),[`bush`,2]],[F(54,21),[`rock`,0]],[F(55,21),[`rock`,1]],[F(54,23),[`river-rock`,0]],[F(55,24),[`river-rock`,1]],[F(56,23),[`river-rock`,2]],[F(22,10),[`reeds`,0]],[F(22,11),[`reeds`,1]],[F(31,9),[`kash`,0]],[F(25,11),[`kash`,1]],[F(28,9),[`flowers`,0]],[F(29,9),[`flowers`,1]],[F(30,9),[`flowers`,2]],[F(19,10),[`rice`,0]],[F(20,10),[`rice`,0]],[F(21,10),[`rice`,0]],[F(19,11),[`rice`,1]],[F(20,11),[`rice`,1]],[F(21,11),[`rice`,1]],[F(33,0),[`hut`,0]],[F(34,17),null],[F(20,21),null],[F(21,21),null],[F(20,22),null],[F(21,22),null],[F(20,23),null],[F(21,23),null],[F(10,1),[`stall`,0]],[F(10,2),null],[F(11,5),null],[F(13,5),null],[F(25,2),[`sacks`,0]],[F(26,2),[`sacks`,1]],[F(27,2),[`sacks`,2]],[F(13,7),[`basket`,0]],[F(23,0),[`barrel`,0]],[F(17,7),[`lantern`,0]],[F(20,0),[`signpost`,0]],[F(53,16),[`pile`,0]],[F(53,17),[`pile`,1]],[F(8,2),[`jetty`,0]],[F(8,3),[`jetty`,1]],[F(52,23),[`fence`,0]],[F(53,23),[`fence`,1]],[F(53,15),[`boat`,0]],[F(53,18),[`boat`,1]]]),L=e=>typeof e==`object`&&!!e&&!Array.isArray(e);function R(e,t){if(typeof e!=`number`||!Number.isInteger(e)||e<t)return null;let n=e-t;return[n%P,Math.floor(n/P)]}function Te(e){let t=L(e)?e:{},n=typeof t.width==`number`?t.width:0,r=typeof t.height==`number`?t.height:0,i=(Array.isArray(t.tilesets)?t.tilesets:[])[0],a=L(i)&&typeof i.firstgid==`number`?i.firstgid:1,o=(Array.isArray(t.layers)?t.layers:[]).filter(L),s=Array(n*r).fill(`grass`),c=[],l=[],u=[],d=[],f=new Set,p=(e,t)=>{(Array.isArray(e.data)?e.data:[]).forEach((e,r)=>{let i=R(e,a);i&&t({x:r%n,y:Math.floor(r/n)},i[0],i[1])})},m=e=>e.y*n+e.x;for(let e of o){let n=typeof e.name==`string`?e.name:``;if(e.type===`objectgroup`){if(n!==`scenery`||!Array.isArray(e.objects))continue;for(let n of e.objects){if(!L(n))continue;let e=R(n.gid,a),r=typeof n.x==`number`?n.x:NaN,i=typeof n.y==`number`?n.y:NaN;if(!e||!Number.isFinite(r)||!Number.isFinite(i))continue;let o=I.get(F(e[0],e[1])),s=typeof t.tilewidth==`number`?t.tilewidth:16,l={x:Math.floor(r/s),y:Math.floor((i-s)/s)};o?c.push({...l,kind:o[0],variant:o[1]}):o===void 0&&f.add(F(e[0],e[1]))}}else e.type!==`tilelayer`||n.startsWith(`blocked`)||n.startsWith(`above`)||(n.startsWith(`built`)?p(e,(e,t,n)=>{let r=I.get(F(t,n));r?.[0]===`jetty`?l.push(e):r?.[0]===`fence`?u.push(e):f.add(F(t,n))}):n.startsWith(`barrier`)?p(e,e=>d.push(e)):p(e,(e,t,n)=>{let r=F(t,n);if(be.has(r))s[m(e)]=`water`;else if(r===xe)s[m(e)]=`bank-west`;else if(r===Se)s[m(e)]=`bank-east`;else if(Ce(t,n))s[m(e)]=`sand`;else if(we(t,n))s[m(e)]=`road`;else if(t===5&&n<=1)s[m(e)]=`grass`;else{let t=I.get(r);t?c.push({...e,kind:t[0],variant:t[1]}):t===void 0&&f.add(r)}}))}for(let e of c)e.kind===`rice`&&(s[m(e)]=`mud`);return{width:n,height:r,ground:s,props:c,deck:l,rails:u,barriers:d,unknown:[...f].sort()}}var Ee={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new v(0)},defaultOpacity:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform vec3 defaultColor;
		uniform float defaultOpacity;
		uniform float luminosityThreshold;
		uniform float smoothWidth;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );

			float v = luminance( texel.xyz );

			vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );

			float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

			gl_FragColor = mix( outputColor, texel, alpha );

		}`},z=class e extends ge{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new T(256,256):new T(e.x,e.y),this.clearColor=new v(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let a=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);this.renderTargetBright=new h(a,o,{type:y,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new h(a,o,{type:y,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new h(a,o,{type:y,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),a=Math.round(a/2),o=Math.round(o/2)}let s=Ee;this.highPassUniforms=f.clone(s.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new i({uniforms:this.highPassUniforms,vertexShader:s.vertexShader,fragmentShader:s.fragmentShader}),this.separableBlurMaterials=[];let c=[6,10,14,18,22];a=Math.round(this.resolution.x/2),o=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(c[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new T(1/a,1/o),a=Math.round(a/2),o=Math.round(o/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let l=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=l,this.bloomTintColors=[new x(1,1,1),new x(1,1,1),new x(1,1,1),new x(1,1,1),new x(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=f.clone(k.uniforms),this.blendMaterial=new i({uniforms:this.copyUniforms,vertexShader:k.vertexShader,fragmentShader:k.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new v,this._oldClearAlpha=1,this._basic=new C,this._fsQuad=new me(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new T(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],a=[];for(let n=1;n<e;n+=2){let i=t[n],o=n+1<e?t[n+1]:0,s=i+o;r.push((n*i+(n+1)*o)/s),a.push(s)}return new i({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new T(.5,.5)},direction:{value:new T(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:a}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				#include <common>

				varying vec2 vUv;

				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float centerWeight;
				uniform float gaussianOffsets[KERNEL_PAIRS];
				uniform float gaussianWeights[KERNEL_PAIRS];

				void main() {

					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * centerWeight;

					for ( int i = 0; i < KERNEL_PAIRS; i ++ ) {

						vec2 uvOffset = direction * invSize * gaussianOffsets[ i ];
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += ( sample1 + sample2 ) * gaussianWeights[ i ];

					}

					gl_FragColor = vec4( diffuseSum, 1.0 );

				}`})}_getCompositeMaterial(e){return new i({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

				varying vec2 vUv;

				void main() {

					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

				}`,fragmentShader:`

				varying vec2 vUv;

				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor( const in float factor ) {

					float mirrorFactor = 1.2 - factor;
					return mix( factor, mirrorFactor, bloomRadius );

				}

				void main() {

					// 3.0 for backwards compatibility with previous alpha-based intensity
					vec3 bloom = 3.0 * bloomStrength * (
						lerpBloomFactor( bloomFactors[ 0 ] ) * bloomTintColors[ 0 ] * texture2D( blurTexture1, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 1 ] ) * bloomTintColors[ 1 ] * texture2D( blurTexture2, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 2 ] ) * bloomTintColors[ 2 ] * texture2D( blurTexture3, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 3 ] ) * bloomTintColors[ 3 ] * texture2D( blurTexture4, vUv ).rgb +
						lerpBloomFactor( bloomFactors[ 4 ] ) * bloomTintColors[ 4 ] * texture2D( blurTexture5, vUv ).rgb
					);

					float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );
					gl_FragColor = vec4( bloom, bloomAlpha );

				}`})}};z.BlurDirectionX=new T(1,0),z.BlurDirectionY=new T(0,1);var De={name:`HorizontalTiltShiftShader`,uniforms:{tDiffuse:{value:null},h:{value:1/512},r:{value:.35}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform float h;
		uniform float r;

		varying vec2 vUv;

		void main() {

			vec4 sum = vec4( 0.0 );

			float hh = h * abs( r - vUv.y );

			sum += texture2D( tDiffuse, vec2( vUv.x - 4.0 * hh, vUv.y ) ) * 0.051;
			sum += texture2D( tDiffuse, vec2( vUv.x - 3.0 * hh, vUv.y ) ) * 0.0918;
			sum += texture2D( tDiffuse, vec2( vUv.x - 2.0 * hh, vUv.y ) ) * 0.12245;
			sum += texture2D( tDiffuse, vec2( vUv.x - 1.0 * hh, vUv.y ) ) * 0.1531;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
			sum += texture2D( tDiffuse, vec2( vUv.x + 1.0 * hh, vUv.y ) ) * 0.1531;
			sum += texture2D( tDiffuse, vec2( vUv.x + 2.0 * hh, vUv.y ) ) * 0.12245;
			sum += texture2D( tDiffuse, vec2( vUv.x + 3.0 * hh, vUv.y ) ) * 0.0918;
			sum += texture2D( tDiffuse, vec2( vUv.x + 4.0 * hh, vUv.y ) ) * 0.051;

			gl_FragColor = sum;

		}`},Oe={name:`VerticalTiltShiftShader`,uniforms:{tDiffuse:{value:null},v:{value:1/512},r:{value:.35}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform sampler2D tDiffuse;
		uniform float v;
		uniform float r;

		varying vec2 vUv;

		void main() {

			vec4 sum = vec4( 0.0 );

			float vv = v * abs( r - vUv.y );

			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * vv ) ) * 0.051;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * vv ) ) * 0.0918;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * vv ) ) * 0.12245;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * vv ) ) * 0.1531;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * vv ) ) * 0.1531;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * vv ) ) * 0.12245;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * vv ) ) * 0.0918;
			sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * vv ) ) * 0.051;

			gl_FragColor = sum;

		}`};function ke(e,t){try{let e=new URLSearchParams(window.location.search).get(`quest3dq`);if(e===`high`||e===`low`)return e}catch{}if(t)return`low`;try{let t=e.getContext(),n=t.getExtension(`WEBGL_debug_renderer_info`),r=String(n?t.getParameter(n.UNMASKED_RENDERER_WEBGL):t.getParameter(t.RENDERER));if(/swiftshader|llvmpipe|software|basic render/i.test(r))return`low`}catch{}return`high`}function Ae(e,t){let n=new fe;n.scale.setScalar(100);let r=n.material.uniforms;r.turbidity.value=5,r.rayleigh.value=1.8,r.mieCoefficient.value=.006,r.mieDirectionalG.value=.82,r.sunPosition.value.copy(t);let i=new u;i.add(n);let a=new se(e),o=a.fromScene(i,.04);return a.dispose(),n.geometry.dispose(),n.material.dispose(),o}var je={name:`QuestGradeShader`,uniforms:{tDiffuse:{value:null},uSaturation:{value:1.12},uWarmth:{value:.035},uVignette:{value:.28}},vertexShader:`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uWarmth;
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec4 colour = texture2D(tDiffuse, vUv);
      float grey = dot(colour.rgb, vec3(0.299, 0.587, 0.114));
      colour.rgb = mix(vec3(grey), colour.rgb, uSaturation);
      colour.rgb += vec3(uWarmth, uWarmth * 0.45, -uWarmth * 0.6);
      vec2 centred = vUv - 0.5;
      colour.rgb *= 1.0 - uVignette * smoothstep(0.32, 0.85, length(centred * vec2(1.15, 1.0)));
      gl_FragColor = colour;
    }
  `},Me=class{renderer;scene;camera;quality;onQuality;composer=null;tiltH=null;tiltV=null;slowTime=0;size=new T(1,1);constructor(e,t,n,r,i=()=>void 0){this.renderer=e,this.scene=t,this.camera=n,this.quality=r,this.onQuality=i,r===`high`&&this.buildComposer()}get level(){return this.quality}buildComposer(){let{x:e,y:t}=this.size,n=new h(e,t,{type:y,samples:4}),r=new de(this.renderer,n);r.addPass(new _e(this.scene,this.camera));let i=new he(this.scene,this.camera,e,t);i.blendIntensity=.85,i.updateGtaoMaterial({radius:.55,distanceExponent:1.4,thickness:1.2,scale:1,samples:12}),r.addPass(i),r.addPass(new z(new T(e,t),.18,.4,1.6)),this.tiltH=new O(De),this.tiltV=new O(Oe),r.addPass(this.tiltH),r.addPass(this.tiltV),r.addPass(new pe),r.addPass(new O(je)),this.composer=r,this.setSize(e,t)}setSize(e,t){this.size.set(e,t),this.composer&&(this.composer.setPixelRatio(this.renderer.getPixelRatio()),this.composer.setSize(e,t),this.tiltH&&(this.tiltH.uniforms.h.value=3/e,this.tiltH.uniforms.r.value=.52),this.tiltV&&(this.tiltV.uniforms.v.value=3/t,this.tiltV.uniforms.r.value=.52))}render(e=0){this.composer?(this.composer.render(e),e>.045?this.slowTime+=e:this.slowTime=Math.max(0,this.slowTime-e*2),this.slowTime>3&&this.lower()):this.renderer.render(this.scene,this.camera)}lower(){this.quality!==`low`&&(this.quality=`low`,this.dropComposer(),this.onQuality(`low`))}dropComposer(){let e=this.composer;if(e){for(let t of e.passes)t.dispose();e.dispose(),this.composer=null,this.tiltH=null,this.tiltV=null}}dispose(){this.dropComposer()}},B=(e,t,n=0)=>{let r=Math.imul(e*374761393+t*668265263+n*2147483647,1274126177);return r=Math.imul(r^r>>>13,1103515245),((r^r>>>16)>>>0)/4294967295},V=e=>e*e*(3-2*e);function H(e,t,n=0){let r=Math.floor(e),i=Math.floor(t),a=V(e-r),o=V(t-i),s=B(r,i,n),c=B(r+1,i,n),l=B(r,i+1,n),u=B(r+1,i+1,n);return(s+(c-s)*a)*(1-o)+(l+(u-l)*a)*o}var U=(e,t,n=0)=>H(e,t,n)*.6+H(e*2.1,t*2.1,n+1)*.3+H(e*4.3,t*4.3,n+2)*.1,Ne={grass:0,road:-.04,sand:-.06,mud:-.12,"bank-west":-.45,"bank-east":-.45,water:-.9},W=new Set([`road`,`sand`,`mud`]),G={grass:new v(`#5f9638`),road:new v(`#b27a48`),sand:new v(`#dcc390`),mud:new v(`#5d4029`),"bank-west":new v(`#5e6a35`),"bank-east":new v(`#5e6a35`),water:new v(`#4a6b45`)},Pe=new v(`#4d872c`),Fe=new v(`#8fa648`),Ie=class{scene;constructor(e){this.scene=e}kind(e,t){let{width:n,height:r,ground:i}=this.scene,a=Math.min(n-1,Math.max(0,e));return i[Math.min(r-1,Math.max(0,t))*n+a]??`grass`}around(e,t){let n=e-.5,r=t-.5,i=Math.floor(n),a=Math.floor(r),o=V(Math.min(1,Math.max(0,n-i))),s=V(Math.min(1,Math.max(0,r-a)));return[{kind:this.kind(i,a),weight:(1-o)*(1-s)},{kind:this.kind(i+1,a),weight:o*(1-s)},{kind:this.kind(i,a+1),weight:(1-o)*s},{kind:this.kind(i+1,a+1),weight:o*s}]}pathWeight(e,t){return this.around(e,t).reduce((e,t)=>e+(W.has(t.kind)?t.weight:0),0)}heightAt(e,t){let n=this.around(e,t).reduce((e,t)=>e+Ne[t.kind]*t.weight,0),r=Math.min(1,Math.max(0,(n+.25)/.25)),i=1-Math.min(1,this.pathWeight(e,t)*1.6);return n+(U(e*.32,t*.32,7)-.5)*.24*r*i}colourAt(e,t,n){let r=this.around(e,t),i=U(e*.22,t*.22,3),a=Pe.clone().lerp(Fe,V(Math.min(1,Math.max(0,i*1.6-.45))));a.lerp(G.grass,.35),n.setRGB(0,0,0);for(let e of r){let t=e.kind===`grass`?a:G[e.kind];n.r+=t.r*e.weight,n.g+=t.g*e.weight,n.b+=t.b*e.weight}let o=r.filter(e=>W.has(e.kind)).sort((e,t)=>t.weight-e.weight)[0];if(o){let e=r.filter(e=>e.kind===o.kind).reduce((e,t)=>e+t.weight,0),t=V(Math.min(1,Math.max(0,(e-.32)/.22)));n.lerp(G[o.kind],t)}let s=.94+H(e*3.7,t*3.7,11)*.12;return n.multiplyScalar(s)}};function Le(e,t,n){let r=n===`high`?4:2,i=new E(t.width+24,t.height+24,(t.width+24)*r,(t.height+24)*r);i.rotateX(-Math.PI/2),i.translate(t.width/2,0,t.height/2);let a=i.attributes.position,o=new Float32Array(a.count*3),s=new v;for(let t=0;t<a.count;t+=1){let n=a.getX(t),r=a.getZ(t);a.setY(t,e.heightAt(n,r)),e.colourAt(n,r,s),o.set([s.r,s.g,s.b],t*3)}i.setAttribute(`color`,new ne(o,3)),i.computeVertexNormals();let c=new S(i,new w({vertexColors:!0,roughness:.95,metalness:0}));return c.receiveShadow=!0,c}function Re(e,t,n,i,a){let o=[],s=[],c=new v(i),l=new v(a);for(let r=0;r<e;r+=1){let i=r/e*Math.PI+B(r,e)*.6,a=.25+B(r,7)*.35,u=t*(.7+B(r,3)*.5),d=Math.cos(i)*n,f=Math.sin(i)*n,p=Math.cos(i+Math.PI/2)*a*u*.5,m=Math.sin(i+Math.PI/2)*a*u*.5;o.push(-d,0,-f,d,0,f,p,u,m),s.push(c.r,c.g,c.b,c.r,c.g,c.b,l.r,l.g,l.b)}let u=new le;return u.setAttribute(`position`,new r(o,3)),u.setAttribute(`color`,new r(s,3)),u.computeVertexNormals(),u}function ze(e,t){let n=new w({vertexColors:!0,side:2,roughness:.85,metalness:0});return n.onBeforeCompile=n=>{n.uniforms.uTime=e,n.vertexShader=n.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 rootWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 rootWorld = vec4(0.0);
        #endif
        float gust = sin(uTime * 1.7 + rootWorld.x * 0.55 + rootWorld.z * 0.35)
          + 0.4 * sin(uTime * 3.3 + rootWorld.x * 1.7);
        transformed.x += gust * ${t.toFixed(3)} * position.y;
        transformed.z += gust * ${(t*.4).toFixed(3)} * position.y;`)},n}function Be(e,t,r,i){let o=new a(e,t,Math.max(1,r.length)),s=new ce,c=new n,l=new x(0,1,0);return r.forEach((e,t)=>{c.setFromAxisAngle(l,e.turn),s.compose(new x(e.x,i(e.x,e.z),e.z),c,new x(e.scale,e.scale,e.scale)),o.setMatrixAt(t,s)}),o.count=r.length,o.receiveShadow=!0,o.castShadow=!1,o}function Ve(e,t){let n=[];for(let{x:r,y:i}of e){let e=-1/0;for(let n=0;n<=4;n+=1)for(let a=0;a<=4;a+=1)e=Math.max(e,t(r+n/4,i+a/4));let a=e+.02;n.push(r,a,i,r,a,i+1,r+1,a,i,r+1,a,i,r,a,i+1,r+1,a,i+1)}let i=new le;i.setAttribute(`position`,new r(n,3)),i.computeVertexNormals();let a=new S(i,new w({color:`#4f7468`,roughness:.06,metalness:.05,transparent:!0,opacity:.62}));return a.receiveShadow=!0,a}function He(e,t){let n=new Ie(e),r=(e,t)=>n.heightAt(e,t),i={value:0},a=[],o=[],s=e=>(o.push(e),e),c=Le(n,e,t.quality);s(c.geometry),s(c.material),a.push(c);let l=t.quality===`high`?6:2,u=[];for(let r=0;r<e.height;r+=1)for(let i=0;i<e.width;i+=1)if(!(n.kind(i,r)!==`grass`||t.occupied.has(`${i},${r}`)))for(let e=0;e<l;e+=1){let t=i+B(i,r,e*2+31),a=r+B(i,r,e*2+32);n.pathWeight(t,a)>.25||n.heightAt(t,a)<-.12||u.push({x:t,z:a,scale:.7+B(i,r,e+50)*.7,turn:B(i,r,e+60)*6.28})}u.sort((e,t)=>B(Math.floor(e.x*97),Math.floor(e.z*89),5)-B(Math.floor(t.x*97),Math.floor(t.z*89),5));let d=Be(s(Re(5,.26,.03,`#3d7a26`,`#a7d060`)),s(ze(i,.22)),u,r);a.push(d);let f=e.props.filter(e=>e.kind===`rice`);if(f.length>0){let e=[];for(let t of f)for(let n=0;n<3;n+=1)for(let r=0;r<3;r+=1)e.push({x:t.x+.18+r*.32+(B(t.x,t.y,n*3+r)-.5)*.06,z:t.y+.18+n*.32+(B(t.y,t.x,n*3+r)-.5)*.06,scale:.85+B(t.x,n,r)*.3,turn:B(r,n,t.x)*6.28});let t=Be(s(Re(7,.42,.02,`#4c8a2c`,`#b8d86a`)),s(ze(i,.16)),e,r);a.push(t);let n=Ve(f,r);s(n.geometry),s(n.material),a.push(n)}return{objects:a,heightAt:r,update(e){i.value=e},lower(){d.count=Math.ceil(u.length/3)},dispose(){for(let e of o)e.dispose()}}}var Ue=.16,We=3,Ge=-.22,K=new x(-16,8,4).normalize(),Ke={ArrowLeft:{x:-1,y:0},KeyA:{x:-1,y:0},ArrowRight:{x:1,y:0},KeyD:{x:1,y:0},ArrowUp:{x:0,y:-1},KeyW:{x:0,y:-1},ArrowDown:{x:0,y:1},KeyS:{x:0,y:1}},q=(e,t,n=0)=>{let r=Math.imul(e*374761393+t*668265263+n*2147483647,1274126177);return r=Math.imul(r^r>>>13,1103515245),((r^r>>>16)>>>0)/4294967295},J=(e,t)=>e.x===t.x&&e.y===t.y,Y=e=>new x(e.x+.5,0,e.y+.5);function qe(e,t){return Math.max(e.x-t.x,0,t.x-(e.x+e.w-1))+Math.max(e.y-t.y,0,t.y-(e.y+e.h-1))}var X=[`#c68e62`,`#a8714a`,`#8d5b3b`],Z={hero:{skin:X[0],shirt:`#2ecc71`,lower:`#2f3b4c`,hair:`#1c1814`},boatman:{skin:X[2],shirt:`#efe6d2`,lower:`#3b7f86`,hair:`#dcd6cc`,hat:`#d8b264`,beard:`#e8e2d8`},seller:{skin:X[1],shirt:`#d9622b`,lower:`#efe6d2`,hair:`#1c1814`},fisher:{skin:X[2],shirt:`#5f9e48`,lower:`#3b5f86`,hair:`#1c1814`,hat:`#2d8a7a`},farmer:{skin:X[2],shirt:`#f1ece2`,lower:`#7d5a9e`,hair:`#1c1814`,hat:`#d8b264`},villager:{skin:X[0],shirt:`#e0742e`,lower:`#b8392b`,hair:`#1c1814`,long:!0}},Je=class{materials=new Map;disposables=[];mat(e,t={}){let n=`${e}|${t.emissive??``}|${t.rough??.9}`,r=this.materials.get(n);return r||(r=new w({color:e,roughness:t.rough??.9,metalness:0,flatShading:!0,...t.emissive?{emissive:t.emissive,emissiveIntensity:.9}:{}}),this.materials.set(n,r),this.disposables.push(r)),r}keep(e){return this.disposables.push(e),e}mesh(e,t,n=!0){this.keep(e);let r=new S(e,t);return r.castShadow=n,r.receiveShadow=!0,r}};function Ye(t,n,r){let i=new e,a=t.mat(`#5a8f38`,{rough:1}),o=t.mesh(new E(40,n.height+80),a,!1);o.rotation.x=-Math.PI/2,o.position.set(-32,-.03,n.height/2);let s=t.mesh(new E(40,n.height+80),a,!1);s.rotation.x=-Math.PI/2,s.position.set(n.width+12+20,-.03,n.height/2);for(let[e,o]of[[-12,r.west],[r.east,n.width+12]])for(let r of[-32,n.height+12+20]){let n=t.mesh(new E(o-e,40),a,!1);n.rotation.x=-Math.PI/2,n.position.set((e+o)/2,-.03,r),i.add(n)}let c=t.mesh(new E(r.east-r.west+2,n.height+80),t.mat(`#4f7a52`),!1);return c.rotation.x=-Math.PI/2,c.position.set((r.west+r.east)/2,-.92,n.height/2),i.add(o,s,c),i}function Xe(e,t,n){let r=e.keep(new i({transparent:!0,fog:!0,uniforms:f.merge([ae.fog,{uTime:{value:0},uDeep:{value:new v(`#2d7f8c`)},uShallow:{value:new v(`#3f9f98`)},uFoam:{value:new v(`#f4f1e4`)},uBanks:{value:new T(n.west+.55,n.east-.55)}}]),vertexShader:`
        #include <fog_pars_vertex>
        uniform float uTime;
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          world.y += (sin(world.x * 1.4 + uTime * 1.1) + cos(world.z * 1.1 + uTime * 0.9)) * 0.015;
          vWorld = world.xyz;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,fragmentShader:`
        #include <fog_pars_fragment>
        uniform float uTime;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uFoam;
        uniform vec2 uBanks;
        varying vec3 vWorld;
        void main() {
          float edge = min(vWorld.x - uBanks.x, uBanks.y - vWorld.x);
          float shallow = 1.0 - smoothstep(0.0, 2.8, edge);
          vec3 colour = mix(uDeep, uShallow, 0.15 + shallow * 0.75);
          // Slow bands of light on the current, and low sun glinting off it.
          float flow = sin(vWorld.z * 0.9 - uTime * 0.6 + sin(vWorld.x * 0.7) * 1.5);
          colour += vec3(0.04, 0.06, 0.05) * flow;
          float ripple = sin(vWorld.x * 3.1 + uTime * 1.3) * sin(vWorld.z * 2.3 - uTime * 0.9)
            + sin((vWorld.x + vWorld.z) * 4.7 + uTime * 1.7) * 0.5;
          // Glints: thin, stretched along the current, and few.
          float streak = smoothstep(1.3, 1.48, ripple) * (0.5 + 0.5 * sin(vWorld.x * 9.0));
          colour += vec3(1.0, 0.86, 0.62) * streak * 0.08;
          float foam = 1.0 - smoothstep(0.02, 0.16, edge + sin(vWorld.z * 3.0 + uTime) * 0.04);
          colour = mix(colour, uFoam, foam * 0.18);
          gl_FragColor = vec4(colour, 0.9);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `})),a=new E(n.east-n.west,t.height+80,28,80),o=e.mesh(a,r,!1);return o.rotation.x=-Math.PI/2,o.position.set((n.west+n.east)/2,Ge,t.height/2),o.receiveShadow=!1,{water:o,material:r}}function Q(t,n,r,i=`#c7a45a`){let a=new e,o=t.mesh(new D(r,r*1.05,n,7),t.mat(i));a.add(o);for(let e of[-.3,.2]){let i=t.mesh(new D(r*1.25,r*1.25,Math.min(.05,n*.05),7),t.mat(`#9c7c3c`));i.position.y=e*n,a.add(i)}return a}function Ze(t,n){let r=new e,i=q(n.x,n.y),a=.85+i*.35;if(n.kind===`tree`&&q(n.x,n.y,9)<.34){let n=t.mesh(new D(.08,.12,1.1,6),t.mat(`#8a9a4a`));n.position.y=.55,r.add(n);for(let n=0;n<6;n+=1){let a=new e,o=t.mesh(new g(.26,.02,.85),t.mat(n%2?`#4f9a30`:`#62ad3a`));o.position.z=.42,a.add(o);let s=n/6*Math.PI*2+i;a.position.y=1.08+n%3*.08,a.rotation.set(-.35+n%2*.25,s,0,`YXZ`),r.add(a)}}else if(n.kind===`pine`){let e=t.mesh(new D(.05,.08,2.4,6),t.mat(`#8b7355`));e.position.y=1.2,r.add(e);for(let e=0;e<7;e+=1){let n=t.mesh(new g(.12,.02,.75),t.mat(`#4f8a31`)),i=e/7*Math.PI*2;n.position.set(Math.sin(i)*.3,2.35,Math.cos(i)*.3),n.rotation.set(.7,i,0),r.add(n)}}else{let e=n.kind===`krishnachura`,a=t.mesh(new D(.09,.14,e?.9:.8,6),t.mat(`#6e4b2e`));a.position.y=e?.45:.4,r.add(a);let o=n.variant===1?[`#2f7d5b`,`#357f5e`]:[`#4f8f32`,`#5a9c38`,`#467f2c`],s=e?[`#e2552d`,`#d8462a`,`#ef6a35`]:o,l=e?4:3;for(let n=0;n<l;n+=1){let a=e?.42:.48-n*.06,o=t.mesh(new c(a,0),t.mat(s[n%s.length]??`#4f8f32`)),u=n/l*Math.PI*2+i*3,d=e?.38:.2;o.position.set(Math.sin(u)*d,(e?1.05:1)+n*(e?.02:.2),Math.cos(u)*d),e&&o.scale.set(1.2,.55,1.2),r.add(o)}if(n.kind===`fruit-tree`)for(let e=0;e<6;e+=1){let n=t.mesh(new d(.06,6,4),t.mat(`#f0a32e`),!1),i=e/6*Math.PI*2;n.position.set(Math.sin(i)*.42,.95+e%2*.25,Math.cos(i)*.42),r.add(n)}}return r.scale.setScalar(a),r.rotation.y=i*Math.PI*2,r}function Qe(t,n,r){let i=new e,a=n.kind===`kash`,o=a?7:6;for(let s=0;s<o;s+=1){let c=new e,l=(a?.75:.55)+q(n.x,n.y,s)*.3,u=t.mesh(new p(.03,l,4),t.mat(a?`#9fb36a`:`#5e8f3a`),!1);if(u.position.y=l/2,c.add(u),a){let e=t.mesh(new d(.07,5,4),t.mat(`#f6f3ea`),!1);e.scale.set(.7,1.9,.7),e.position.y=l+.08,c.add(e)}let f=s/o*Math.PI*2;c.position.set(Math.sin(f)*.18,0,Math.cos(f)*.18),c.rotation.z=(q(n.x,s)-.5)*.3,c.userData.phase=q(n.x,n.y,s+20)*Math.PI*2,r.push(c),i.add(c)}return i}function $e(t){let n=new e,r=t.mesh(new g(1.7,1.05,2.2),t.mat(`#c9955e`));r.position.y=.52,n.add(r);let i=t.mesh(new g(1.9,.12,2.4),t.mat(`#a87a4a`));i.position.y=.06,n.add(i);let a=t.mesh(new p(1.55,1,4,1),t.mat(`#c9a050`));a.rotation.y=Math.PI/4,a.scale.set(1,1,1.55),a.position.y=1.5,n.add(a);let o=t.mesh(new g(.45,.72,.06),t.mat(`#5b3a22`),!1);o.position.set(.25,.4,1.11),n.add(o);let s=t.mesh(new g(.3,.25,.06),t.mat(`#3b2a1a`),!1);return s.position.set(-.45,.6,1.11),n.add(s),n}function et(t){let n=new e;for(let[e,r]of[[-.85,-.4],[.85,-.4],[-.85,.45],[.85,.45]]){let i=t.mesh(new D(.04,.04,1.3,5),t.mat(`#7a5232`));i.position.set(e,.65,r),n.add(i)}let r=t.mesh(new g(1.8,.5,.6),t.mat(`#9a6a3e`));r.position.set(0,.25,.3),n.add(r);let i=document.createElement(`canvas`);i.width=64,i.height=8;let a=i.getContext(`2d`);if(a)for(let e=0;e<8;e+=1)a.fillStyle=e%2?`#f2e8d2`:`#d9622b`,a.fillRect(e*8,0,8,8);let o=t.keep(new _(i));o.colorSpace=s;let c=t.keep(new w({map:o,roughness:.9,side:2})),l=t.mesh(new E(2,1.1),c);l.rotation.x=-Math.PI/2+.35,l.position.set(0,1.32,.05),n.add(l);for(let[e,r]of[`#f2c230`,`#8bc34a`,`#e8732c`,`#f2c230`].entries()){let i=t.mesh(new d(.16,6,4),t.mat(r),!1);i.scale.y=.6,i.position.set(-.6+e*.4,.55,.3),n.add(i)}return n}function tt(t,n){let r=new e,i=new g(.62,.28,2,1,1,10),a=i.attributes.position;for(let e=0;e<a.count;e+=1){let t=a.getZ(e),n=Math.abs(t)/1;a.setX(e,a.getX(e)*(1-n*n*.92)),a.getY(e)>0?a.setY(e,a.getY(e)+n*n*.28):a.setY(e,a.getY(e)*(1-n*.5))}i.computeVertexNormals();let o=t.mesh(i,t.mat(`#6e4326`));r.add(o);let s=t.mesh(new g(.42,.05,1.3),t.mat(`#8a5a33`),!1);if(s.position.y=.1,r.add(s),n){let n=t.mesh(new D(.34,.34,.8,8,1,!0,0,Math.PI),t.mat(`#b68e4c`));n.rotation.set(Math.PI/2,0,Math.PI/2),n.rotation.order=`YXZ`,n.rotation.set(0,0,0),n.rotation.x=Math.PI/2,n.rotation.y=Math.PI/2,n.position.y=.16,n.scale.set(1,1,1);let i=new e;i.add(n),i.rotation.y=Math.PI/2,r.add(i)}return r}function $(t,n){let r=new e,i=[];for(let a of[-1,1]){let o=new e,s=t.mesh(new g(.11,.36,.12),t.mat(n.lower));s.position.y=-.18,o.add(s),o.position.set(a*.08,.38,0),i.push(o),r.add(o)}let a=t.mesh(new D(.15,.19,.42,7),t.mat(n.shirt));if(a.position.y=.58,r.add(a),n.long){let e=t.mesh(new D(.19,.24,.42,7),t.mat(n.lower));e.position.y=.3,r.add(e)}let o=[];for(let i of[-1,1]){let a=new e,s=t.mesh(new g(.08,.34,.09),t.mat(n.skin));s.position.y=-.17,a.add(s),a.position.set(i*.21,.76,0),a.rotation.z=i*.12,o.push(a),r.add(a)}let s=t.mesh(new d(.14,8,6),t.mat(n.skin));s.position.y=.95,r.add(s);let c=t.mesh(new d(.15,8,4,0,Math.PI*2,0,Math.PI/2),t.mat(n.hair));if(c.position.y=.97,c.rotation.x=-.25,r.add(c),n.long){let e=t.mesh(new g(.07,.4,.07),t.mat(n.hair));e.position.set(0,.72,-.15),r.add(e)}if(n.beard){let e=t.mesh(new g(.16,.12,.08),t.mat(n.beard));e.position.set(0,.86,.1),r.add(e)}if(n.hat){let e=t.mesh(new p(.34,.16,10),t.mat(n.hat));e.position.y=1.12,r.add(e)}for(let e of[-1,1]){let n=t.mesh(new g(.025,.03,.02),t.mat(`#1a1410`),!1);n.position.set(e*.05,.97,.135),r.add(n)}return{group:r,legs:i,arms:o}}var nt=class{options;kit=new Je;renderer;scene=new u;camera=new ee(34,1,.1,200);sun;ground;finish;skyTarget;clock=new re;calm;coarse;description;waterMaterial;hero;heroShadow;idlers=[];floaters=[];sway=[];spans=new Map;barriers;marks=new Map;hover;tapRing;growing=[];state;grid;cell;route=[];intent=null;stepFrom=null;stepTo=null;stepT=0;walkPhase=0;presses=[];held=new Set;paused=!1;destroyed=!1;tapT=1;framed=!1;cameraTarget=new x;resize;cleanups=[];constructor(n){this.options=n,this.state=n.state,this.grid=M(n.map,n.state.completed);let r=n.start;this.cell=r&&N(this.grid,r)?r:n.map.spawn,this.calm=typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,this.coarse=typeof window.matchMedia==`function`&&window.matchMedia(`(pointer: coarse)`).matches,this.renderer=new oe({antialias:!0,powerPreference:`high-performance`});let i=[];try{this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.coarse?1.5:2)),this.renderer.outputColorSpace=s,this.renderer.toneMapping=4,this.renderer.toneMappingExposure=1.08,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=2,this.renderer.domElement.style.display=`block`,this.renderer.domElement.style.touchAction=`none`,this.renderer.domElement.dataset.questRenderer=`3d`,n.parent.append(this.renderer.domElement),i.push(()=>this.renderer.domElement.remove());let r=new v(`#f3d8ac`);this.scene.background=r,this.scene.fog=new l(r,20,52);let a=ke(this.renderer,this.coarse),c=Ae(this.renderer,K);this.skyTarget=c,i.push(()=>c.dispose()),this.scene.environment=c.texture,this.scene.environmentIntensity=.14,this.scene.add(new o(`#dfe9ff`,`#5a7a3a`,.55)),this.sun=new t(`#ffd49a`,2.7),this.sun.castShadow=!0;let u=a===`high`?2048:1024;this.sun.shadow.mapSize.set(u,u),Object.assign(this.sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:1,far:60}),this.sun.shadow.bias=-6e-4,this.sun.shadow.normalBias=.02,this.scene.add(this.sun,this.sun.target),this.description=Te(n.mapJson);let d=this.riverBanks(),f=He(this.description,{quality:a,occupied:this.occupiedSquares()});this.ground=f,i.push(()=>f.dispose()),this.scene.add(...this.ground.objects),this.scene.add(Ye(this.kit,this.description,d));let{water:p,material:m}=Xe(this.kit,this.description,d);this.waterMaterial=m,this.scene.add(p),this.barriers=new e,this.scene.add(this.barriers),this.buildProps(),this.buildBridge(),this.buildPeople(),this.hero=$(this.kit,Z.hero);let h=this.onGround(Y(this.cell));this.hero.group.position.copy(h),this.scene.add(this.hero.group),this.heroShadow=this.kit.mesh(new b(0,.24,16),this.kit.keep(new C({color:`#000000`,transparent:!0,opacity:.22,depthWrite:!1})),!1),this.heroShadow.rotation.x=-Math.PI/2,this.scene.add(this.heroShadow),this.hover=this.kit.mesh(new b(.36,.46,4,1,Math.PI/4),this.kit.keep(new C({color:`#ffffff`,transparent:!0,opacity:.75,depthWrite:!1})),!1),this.hover.rotation.x=-Math.PI/2,this.hover.visible=!1,this.scene.add(this.hover),this.tapRing=this.kit.mesh(new b(.3,.38,24),this.kit.keep(new C({color:`#ffffff`,transparent:!0,opacity:0,depthWrite:!1})),!1),this.tapRing.rotation.x=-Math.PI/2,this.scene.add(this.tapRing);let g=new Me(this.renderer,this.scene,this.camera,a,()=>{this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)),this.sun.shadow.mapSize.set(1024,1024),this.sun.shadow.map?.dispose(),this.sun.shadow.map=null,this.ground.lower(),this.fit()});this.finish=g,i.push(()=>g.dispose()),this.cameraTarget.copy(this.clampTarget(h)),this.showState(!1),this.listen();let _=new ResizeObserver(()=>this.fit());this.resize=_,i.push(()=>_.disconnect()),_.observe(n.parent),this.fit()}catch(e){for(let e of i.reverse())e();for(let e of this.cleanups)e();for(let e of this.kit.disposables)e.dispose();throw this.renderer.dispose(),e}this.renderer.setAnimationLoop(()=>this.frame()),this.options.onEvent({kind:`ready`})}setState(e){this.state=e,this.grid=M(this.options.map,e.completed),this.showState(!0)}setPaused(e){this.paused!==e&&(this.paused=e,this.route=[],this.intent=null,this.presses=[],this.held.clear(),this.hover.visible=!1,e?(this.renderer.setAnimationLoop(null),this.finish.render()):(this.clock.getDelta(),this.renderer.setAnimationLoop(()=>this.frame())))}destroy(){if(!this.destroyed){this.destroyed=!0,this.renderer.setAnimationLoop(null),this.resize.disconnect();for(let e of this.cleanups)e();for(let e of this.kit.disposables)e.dispose();this.ground.dispose(),this.finish.dispose(),this.skyTarget.dispose(),this.renderer.dispose(),this.renderer.domElement.remove()}}riverBanks(){let{width:e,height:t,ground:n}=this.description,r=e,i=0;for(let a=0;a<t;a+=1)for(let t=0;t<e;t+=1){let o=n[a*e+t];(o===`water`||o===`bank-west`||o===`bank-east`)&&(r=Math.min(r,t),i=Math.max(i,t+1))}return r<i?{west:r,east:i}:{west:0,east:0}}place(e,t,n=0,r=.12,i=!0){let a=t.x+.5+(q(t.x,t.y,5)-.5)*r,o=t.y+.5+(q(t.x,t.y,6)-.5)*r;e.position.set(a,i?this.ground.heightAt(a,o)+n:n,o),this.scene.add(e)}onGround(e){return e.setY(this.ground.heightAt(e.x,e.z))}occupiedSquares(){let e=new Set,t=(t,n)=>e.add(`${t},${n}`);for(let e of this.description.props)if(e.kind!==`rice`&&e.kind!==`flowers`){if(t(e.x,e.y),e.kind===`hut`)for(let n=-3;n<=0;n+=1)for(let r of[-1,0])t(e.x+r,e.y+n);if(e.kind===`stall`)for(let[n,r]of[[1,0],[0,1],[1,1]])t(e.x+n,e.y+r)}return e}buildProps(){let t=this.kit;for(let n of this.description.props)switch(n.kind){case`tree`:case`krishnachura`:case`pine`:case`fruit-tree`:this.place(Ze(t,n),n,0,.3);break;case`bush`:{let e=t.mesh(new c(.38,0),t.mat([`#4f8a31`,`#3f7a2a`,`#5a9a3a`][n.variant]??`#4f8a31`));e.scale.set(1.2,.75,1.1),this.place(e,n,.22);break}case`rock`:case`river-rock`:{let e=t.mesh(new ue(.3,0),t.mat(n.variant===0?`#9a948a`:`#8a8378`));e.scale.set(1.2,.6,1),e.rotation.y=q(n.x,n.y)*6,n.kind===`river-rock`?this.place(e,n,-.16999999999999998,.3,!1):this.place(e,n,.1,.3);break}case`reeds`:case`kash`:this.place(Qe(t,n,this.sway),n,n.x>0?-.05:0,.4);break;case`flowers`:{let r=new e,i=[`#e8452a`,`#9a55d0`,`#fff4d6`][n.variant]??`#e8452a`,a=t.mesh(new c(.2,0),t.mat(`#4f9a30`));a.scale.set(1.4,.5,1.4),a.position.y=.06,r.add(a);for(let e=0;e<6;e+=1){let a=e/6*Math.PI*2+q(n.x,n.y)*3,o=.08+q(n.x,e)*.16,s=t.mesh(new D(.01,.01,.22,3),t.mat(`#3f7f28`),!1);s.position.set(Math.sin(a)*o,.13,Math.cos(a)*o);let l=t.mesh(new c(.055,0),t.mat(i,{rough:.7}),!1);l.position.set(Math.sin(a)*o,.26,Math.cos(a)*o),r.add(s,l)}this.place(r,n);break}case`rice`:break;case`hut`:{let e=$e(t);e.position.set(n.x,this.ground.heightAt(n.x,n.y-.6)-.04,n.y-.6),this.scene.add(e);break}case`stall`:{let e=et(t);e.position.set(n.x+1,this.ground.heightAt(n.x+1,n.y+1),n.y+1),this.scene.add(e);break}case`sacks`:{let e=t.mesh(new d(.22,7,5),t.mat(`#e0d2ae`));e.scale.set(1,1.15,.9),this.place(e,n,.22);break}case`basket`:{let e=t.mesh(new D(.24,.18,.22,8),t.mat(`#b08542`));this.place(e,n,.11);break}case`barrel`:{let e=t.mesh(new D(.2,.2,.45,9),t.mat(`#7a5232`));this.place(e,n,.22);break}case`lantern`:{let r=new e,i=t.mesh(new D(.035,.045,1.2,5),t.mat(`#5b3a22`));i.position.y=.6;let a=t.mesh(new g(.16,.2,.16),t.mat(`#ffd27a`,{emissive:`#ffb347`}));a.position.y=1.25,r.add(i,a),this.place(r,n,0,0);break}case`signpost`:{let r=new e,i=t.mesh(new D(.04,.05,1,5),t.mat(`#6e4b2e`));i.position.y=.5;let a=t.mesh(new g(.6,.22,.05),t.mat(`#a5784a`));a.position.set(.12,.85,0),r.add(i,a),this.place(r,n,0,0);break}case`pile`:{let r=Q(t,1.4,.07);r.position.y=.7;let i=new e;i.add(r);let a=n.variant===0?.4:-.4;i.position.set(n.x+.5,-.65,n.y+.5+a),this.scene.add(i);break}case`jetty`:{let e=t.mesh(new g(1,.08,1),t.mat(n.variant?`#8a5f38`:`#94673d`));if(this.place(e,n,.02,0,!1),(n.x+n.y)%2==0){let e=Q(t,1,.06,`#7a5232`);e.position.set(n.x+.1,-.45,n.y+.1),this.scene.add(e)}break}case`fence`:{let r=new e,i=t.mesh(new g(.1,.7,.1),t.mat(`#7a5232`));i.position.set(-.45,.35,0),r.add(i);for(let e of[.28,.55]){let n=t.mesh(new g(1,.06,.06),t.mat(`#8a6040`));n.position.y=e,r.add(n)}this.place(r,n,0,0);break}case`boat`:{let e=tt(t,n.variant===0);e.rotation.y=q(n.x,n.y)*.4-.2,this.place(e,n,-.16999999999999998,.2,!1),this.floaters.push({group:e,base:e.position.y,phase:q(n.x,n.y,7)*6});break}}}buildBridge(){let t=this.kit;for(let n of this.options.map.gates){let r=this.description.deck.filter(e=>A(n,e));if(r.length===0)continue;let i=new e,a=[...new Set(r.map(e=>e.x))],o=r.map(e=>e.y),s=Math.min(...o),c=Math.max(...o)+1,l=c-s+.4;for(let e of a)for(let n=0;n<6;n+=1){let r=Q(t,l,.075,n%2?`#c9a65c`:`#bf9a50`);r.rotation.x=Math.PI/2,r.position.set(e+.09+n*.165,.1,(s+c)/2),i.add(r)}let u=Math.min(...a),d=Math.max(...a)+1;for(let e of[s-.12,c+.12]){let n=Q(t,d-u,.05);n.rotation.z=Math.PI/2,n.position.set((u+d)/2,.72,e),i.add(n);for(let n=u;n<=d;n+=1){let r=Q(t,.75,.045,`#a8874a`);r.position.set(n,.42,e),i.add(r)}}i.visible=!1,this.scene.add(i),this.spans.set(`${n.quest}@${n.x},${n.y}`,i)}for(let n of this.description.barriers){let r=new e;for(let e of[.25,.5,.75]){let n=t.mesh(new g(1,.08,.08),t.mat(`#8a5a33`));n.position.y=e,r.add(n)}for(let e of[-.45,.45]){let n=t.mesh(new g(.12,1,.12),t.mat(`#6e4326`));n.position.set(e,.5,0),r.add(n)}r.position.set(n.x+.5,0,n.y+.5),r.userData.cell=n,this.barriers.add(r)}}buildPeople(){let e=$(this.kit,Z.boatman);e.group.position.copy(this.onGround(Y(this.options.map.giver))),e.group.rotation.y=Math.PI*.75,this.scene.add(e.group),this.idlers.push({group:e.group,base:e.group.position.y,phase:.4});for(let e of this.options.map.scenery){if(e.kind!==`figure`)continue;let t=Z[e.look];if(!t)continue;let n=$(this.kit,t);n.group.position.copy(this.onGround(Y(e.at))),n.group.rotation.y=q(e.at.x,e.at.y)*Math.PI*2,this.scene.add(n.group),this.idlers.push({group:n.group,base:n.group.position.y,phase:q(e.at.x,e.at.y,2)*6})}}showState(e){let t=ye(this.options.map,this.state.completed),n=e=>t.some(t=>`${t.quest}@${t.x},${t.y}`===e);for(let[t,r]of this.spans){let i=!n(t);i&&!r.visible?(r.visible=!0,e&&!this.calm&&(r.position.y=-.8,this.growing.push({group:r,t:0}))):i||(r.visible=!1)}for(let e of this.barriers.children){let n=e.userData.cell;e.visible=t.some(e=>A(e,n))}let r=new Map;this.state.open.size>0&&r.set(`giver`,Y(this.options.map.giver).setY(1.75));for(let e of t){let t=`gate:${e.quest}`;this.state.open.has(e.quest)&&!r.has(t)&&r.set(t,new x(e.x+e.w/2,1.1,e.y+e.h/2))}for(let[e,t]of this.marks)r.has(e)||(this.scene.remove(t),this.marks.delete(e));for(let[e,t]of r){if(this.marks.has(e))continue;let n=this.kit.mesh(new ie(.17,0),this.kit.mat(`#f5c542`,{emissive:`#f0a020`,rough:.4}),!1);n.scale.set(.8,1.3,.8),n.position.copy(t),n.userData.base=t.y,this.scene.add(n),this.marks.set(e,n)}}listen(){let e=this.renderer.domElement,t=new te,n=new m(new x(0,1,0),0),r=new x,i=i=>{let a=e.getBoundingClientRect(),o=new T((i.clientX-a.left)/a.width*2-1,-((i.clientY-a.top)/a.height)*2+1);if(t.setFromCamera(o,this.camera),!t.ray.intersectPlane(n,r))return null;let s={x:Math.floor(r.x),y:Math.floor(r.z)},{width:c,height:l}=this.options.map;return s.x>=0&&s.y>=0&&s.x<c&&s.y<l?s:null},a=null,o=e=>{a={x:e.clientX,y:e.clientY}},s=e=>{let t=a;if(a=null,this.paused||!t||Math.hypot(e.clientX-t.x,e.clientY-t.y)>12)return;let n=i(e);n&&this.walkTo(n)},c=e=>{if(this.paused||e.pointerType!==`mouse`){this.hover.visible=!1;return}let t=i(e);this.hover.visible=t!==null,t&&this.hover.position.set(t.x+.5,this.groundUnder(t.x+.5,t.y+.5)+.04,t.y+.5)},l=()=>{this.hover.visible=!1},u=e=>e instanceof HTMLElement&&(e.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)),d=e=>{if(this.paused||u(e.target))return;let t=Ke[e.code];t&&(this.held.add(e.code),!e.repeat&&this.presses.length<We&&this.presses.push(t))},f=e=>{this.held.delete(e.code)};e.addEventListener(`pointerdown`,o),e.addEventListener(`pointerup`,s),e.addEventListener(`pointermove`,c),e.addEventListener(`pointerleave`,l),window.addEventListener(`keydown`,d),window.addEventListener(`keyup`,f),this.cleanups.push(()=>{e.removeEventListener(`pointerdown`,o),e.removeEventListener(`pointerup`,s),e.removeEventListener(`pointermove`,c),e.removeEventListener(`pointerleave`,l),window.removeEventListener(`keydown`,d),window.removeEventListener(`keyup`,f)})}walkTo(e){let t=this.options.map,n=j(t,this.state.completed,e);this.intent=J(e,t.giver)?{kind:`giver`}:n?{kind:`gate`,gate:n}:null,this.route=[...ve(this.grid,this.cell,e).steps],this.calm||(this.tapRing.position.set(e.x+.5,this.groundUnder(e.x+.5,e.y+.5)+.05,e.y+.5),this.tapT=0),this.stepTo||this.advance()}advance(){let e=this.route.shift();!e||!N(this.grid,e)?(this.route=[],this.stepFrom=null,this.stepTo=null,this.arrive()):(this.stepFrom=Y(this.cell),this.stepTo=Y(e),this.stepT=0,this.hero.group.rotation.y=Math.atan2(e.x-this.cell.x,e.y-this.cell.y),this.cell=e)}arrive(){let e=this.intent;this.intent=null;let t=this.options.map,n=e=>this.options.onEvent(e);n({kind:`moved`,at:this.cell}),A(t.exit,this.cell)?n({kind:`exit`}):e?.kind===`giver`?Math.abs(t.giver.x-this.cell.x)+Math.abs(t.giver.y-this.cell.y)===1&&n({kind:`giver`}):e?.kind===`gate`&&qe(e.gate,this.cell)===1&&n({kind:`gate`,quest:e.gate.quest})}heldStep(){let e=0,t=0;for(let n of this.held){let r=Ke[n];r&&(e+=r.x,t+=r.y)}return e===0?t===0?null:{x:0,y:Math.sign(t)}:{x:Math.sign(e),y:0}}keyboard(){if(this.stepTo||this.route.length>0)return;let e=this.presses.shift()??null,t=e??this.heldStep();if(!t)return;let n={x:this.cell.x+t.x,y:this.cell.y+t.y};if(N(this.grid,n)){this.route=[n],this.advance();return}if(!e)return;let r=this.options.map;if(J(n,r.giver)){this.hero.group.rotation.y=Math.atan2(t.x,t.y),this.options.onEvent({kind:`giver`});return}let i=j(r,this.state.completed,n);i&&this.options.onEvent({kind:`gate`,quest:i.quest})}frame(){let e=Math.min(this.clock.getDelta(),.05),t=this.clock.elapsedTime;this.paused||this.keyboard();let n=this.hero;this.stepFrom&&this.stepTo?(this.stepT=Math.min(1,this.stepT+e/Ue),n.group.position.lerpVectors(this.stepFrom,this.stepTo,this.stepT),this.walkPhase+=e*14,this.stepT>=1&&(this.stepFrom=null,this.stepTo=null,this.advance())):this.walkPhase*=.8;let r=Math.sin(this.walkPhase)*(this.stepTo?.6:0);n.legs[0]?.rotation.set(r,0,0),n.legs[1]?.rotation.set(-r,0,0),n.arms[0]?.rotation.set(-r*.8,0,-.12),n.arms[1]?.rotation.set(r*.8,0,.12);let i=this.groundUnder(n.group.position.x,n.group.position.z);if(n.group.position.y=i+(this.stepTo?Math.abs(Math.sin(this.walkPhase))*.05:0),this.heroShadow.position.set(n.group.position.x,i+.03,n.group.position.z),!this.calm){this.waterMaterial.uniforms.uTime.value=t,this.ground.update(t);for(let e of this.idlers)e.group.position.y=e.base+Math.sin(t*1.6+e.phase)*.012;for(let e of this.floaters)e.group.position.y=e.base+Math.sin(t*1.3+e.phase)*.035,e.group.rotation.z=Math.sin(t*1.1+e.phase)*.04;for(let e of this.sway){let n=e.userData.phase;e.rotation.x=Math.sin(t*1.4+n)*.12}for(let e of this.marks.values())e.rotation.y=t*1.6,e.position.y=e.userData.base+Math.sin(t*2.4)*.08;this.tapT<1&&(this.tapT=Math.min(1,this.tapT+e*2.5),this.tapRing.scale.setScalar(1+this.tapT*.8),this.tapRing.material.opacity=(1-this.tapT)*.8)}for(let t=this.growing.length-1;t>=0;--t){let n=this.growing[t];if(!n)continue;n.t=Math.min(1,n.t+e*1.6);let r=1-(1-n.t)**3;n.group.position.y=-.8*(1-r),n.t>=1&&this.growing.splice(t,1)}let a=this.clampTarget(n.group.position);this.cameraTarget.lerp(a,1-Math.exp(-e*5)),this.placeCamera(),this.finish.render(e)}clampTarget(e){let{width:t,height:n}=this.options.map,r=this.cameraDistance()*Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect,i=Math.min(t/2,Math.max(1.5,r*.75));return new x(Math.min(t-i,Math.max(i,e.x)),0,Math.min(n-3,Math.max(4,e.z)))}cameraDistance(){let e=this.camera.aspect;return e<.9?17:e<1.3?15:13.5}placeCamera(){let e=this.cameraDistance(),t=this.cameraTarget;this.camera.position.set(t.x,t.y+e*.64,t.z+e*.77),this.camera.lookAt(t.x,t.y,t.z-1.2),this.sun.position.set(t.x+K.x*22,K.y*22,t.z+K.z*22),this.sun.target.position.set(t.x,0,t.z)}fit(){let e=this.options.parent,t=Math.max(1,e.clientWidth),n=Math.max(1,e.clientHeight);this.renderer.setSize(t,n,!1),this.renderer.domElement.style.width=`${t}px`,this.renderer.domElement.style.height=`${n}px`,this.camera.aspect=t/n,this.camera.updateProjectionMatrix(),this.finish.setSize(t,n),this.framed||(this.framed=!0,this.cameraTarget.copy(this.clampTarget(this.hero.group.position))),this.placeCamera(),this.paused&&this.finish.render()}groundUnder(e,t){let n={x:Math.floor(e),y:Math.floor(t)};return this.description.deck.some(e=>J(e,n))?.17:this.ground.heightAt(e,t)}};function rt(e){return new nt(e)}export{rt as createZoneGame};