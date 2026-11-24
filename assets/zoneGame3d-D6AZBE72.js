import{$t as e,A as t,At as n,C as r,Ct as i,D as a,Dt as o,Et as s,Ft as c,I as l,M as u,Mt as d,N as f,O as p,Pt as m,Qt as h,S as g,Vt as _,Yt as v,Zt as y,_ as b,_t as x,at as S,b as C,c as w,d as T,en as E,g as D,gt as O,h as k,ht as ee,j as A,jt as j,kt as te,l as M,lt as N,m as P,mt as ne,n as re,nt as F,r as ie,rn as I,rt as L,st as R,t as z,tn as B,tt as V,u as ae,vt as H,w as oe,x as se,y as U}from"./three.module-DTyH0GeV.js";import{t as ce}from"./Sky-kAOGZP35.js";import{i as le,n as ue,o as de,r as fe,s as pe,t as me}from"./zoneMap-CsWmf2aA.js";var he=57,W=(e,t)=>`${e},${t}`,ge=new Set([W(0,0),W(1,0)]),_e=W(2,1),ve=W(4,1),ye=(e,t)=>e>=5&&e<=9&&t>=19&&t<=24,be=(e,t)=>e>=5&&e<=9&&t>=7&&t<=12||W(e,t)===W(6,0),G=new Map([[W(13,11),[`tree`,0]],[W(15,11),[`tree`,1]],[W(14,11),[`krishnachura`,0]],[W(16,9),[`pine`,0]],[W(18,9),[`pine`,1]],[W(23,10),[`fruit-tree`,0]],[W(23,11),[`fruit-tree`,1]],[W(19,9),[`bush`,0]],[W(21,9),[`bush`,1]],[W(25,9),[`bush`,2]],[W(54,21),[`rock`,0]],[W(55,21),[`rock`,1]],[W(54,23),[`river-rock`,0]],[W(55,24),[`river-rock`,1]],[W(56,23),[`river-rock`,2]],[W(22,10),[`reeds`,0]],[W(22,11),[`reeds`,1]],[W(31,9),[`kash`,0]],[W(25,11),[`kash`,1]],[W(28,9),[`flowers`,0]],[W(29,9),[`flowers`,1]],[W(30,9),[`flowers`,2]],[W(19,10),[`rice`,0]],[W(20,10),[`rice`,0]],[W(21,10),[`rice`,0]],[W(19,11),[`rice`,1]],[W(20,11),[`rice`,1]],[W(21,11),[`rice`,1]],[W(33,0),[`hut`,0]],[W(34,17),null],[W(20,21),null],[W(21,21),null],[W(20,22),null],[W(21,22),null],[W(20,23),null],[W(21,23),null],[W(10,1),[`stall`,0]],[W(10,2),null],[W(11,5),null],[W(13,5),null],[W(25,2),[`sacks`,0]],[W(26,2),[`sacks`,1]],[W(27,2),[`sacks`,2]],[W(13,7),[`basket`,0]],[W(23,0),[`barrel`,0]],[W(17,7),[`lantern`,0]],[W(20,0),[`signpost`,0]],[W(53,16),[`pile`,0]],[W(53,17),[`pile`,1]],[W(8,2),[`jetty`,0]],[W(8,3),[`jetty`,1]],[W(52,23),[`fence`,0]],[W(53,23),[`fence`,1]],[W(53,15),[`boat`,0]],[W(53,18),[`boat`,1]]]),xe=e=>typeof e==`object`&&!!e&&!Array.isArray(e);function Se(e,t){if(typeof e!=`number`||!Number.isInteger(e)||e<t)return null;let n=e-t;return[n%he,Math.floor(n/he)]}function Ce(e){let t=xe(e)?e:{},n=typeof t.width==`number`?t.width:0,r=typeof t.height==`number`?t.height:0,i=(Array.isArray(t.tilesets)?t.tilesets:[])[0],a=xe(i)&&typeof i.firstgid==`number`?i.firstgid:1,o=(Array.isArray(t.layers)?t.layers:[]).filter(xe),s=Array(n*r).fill(`grass`),c=[],l=[],u=[],d=[],f=new Set,p=(e,t)=>{(Array.isArray(e.data)?e.data:[]).forEach((e,r)=>{let i=Se(e,a);i&&t({x:r%n,y:Math.floor(r/n)},i[0],i[1])})},m=e=>e.y*n+e.x;for(let e of o){let n=typeof e.name==`string`?e.name:``;if(e.type===`objectgroup`){if(n!==`scenery`||!Array.isArray(e.objects))continue;for(let n of e.objects){if(!xe(n))continue;let e=Se(n.gid,a),r=typeof n.x==`number`?n.x:NaN,i=typeof n.y==`number`?n.y:NaN;if(!e||!Number.isFinite(r)||!Number.isFinite(i))continue;let o=G.get(W(e[0],e[1])),s=typeof t.tilewidth==`number`?t.tilewidth:16,l={x:Math.floor(r/s),y:Math.floor((i-s)/s)};o?c.push({...l,kind:o[0],variant:o[1]}):o===void 0&&f.add(W(e[0],e[1]))}}else e.type!==`tilelayer`||n.startsWith(`blocked`)||n.startsWith(`above`)||(n.startsWith(`built`)?p(e,(e,t,n)=>{let r=G.get(W(t,n));r?.[0]===`jetty`?l.push(e):r?.[0]===`fence`?u.push(e):f.add(W(t,n))}):n.startsWith(`barrier`)?p(e,e=>d.push(e)):p(e,(e,t,n)=>{let r=W(t,n);if(ge.has(r))s[m(e)]=`water`;else if(r===_e)s[m(e)]=`bank-west`;else if(r===ve)s[m(e)]=`bank-east`;else if(ye(t,n))s[m(e)]=`sand`;else if(be(t,n))s[m(e)]=`road`;else if(t===5&&n<=1)s[m(e)]=`grass`;else{let t=G.get(r);t?c.push({...e,kind:t[0],variant:t[1]}):t===void 0&&f.add(r)}}))}for(let e of c)e.kind===`rice`&&(s[m(e)]=`mud`);return{width:n,height:r,ground:s,props:c,deck:l,rails:u,barriers:d,unknown:[...f].sort()}}var K={name:`CopyShader`,uniforms:{tDiffuse:{value:null},opacity:{value:1}},vertexShader:`

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		uniform float opacity;

		uniform sampler2D tDiffuse;

		varying vec2 vUv;

		void main() {

			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = opacity * texel;


		}`},q=class{constructor(){this.isPass=!0,this.enabled=!0,this.needsSwap=!0,this.clear=!1,this.renderToScreen=!1}setSize(){}render(){console.error(`THREE.Pass: .render() must be implemented in derived pass.`)}dispose(){}},we=new ee(-1,1,1,-1,0,1),Te=new class extends ae{constructor(){super(),this.setAttribute(`position`,new a([-1,3,0,-1,-1,0,3,-1,0],3)),this.setAttribute(`uv`,new a([0,2,0,0,2,0],2))}},J=class{constructor(e){this._mesh=new F(Te,e)}dispose(){this._mesh.geometry.dispose()}render(e){e.render(this._mesh,we)}get material(){return this._mesh.material}set material(e){this._mesh.material=e}},Y=class extends q{constructor(e,t=`tDiffuse`){super(),this.textureID=t,this.uniforms=null,this.material=null,e instanceof c?(this.uniforms=e.uniforms,this.material=e):e&&(this.uniforms=y.clone(e.uniforms),this.material=new c({name:e.name===void 0?`unspecified`:e.name,defines:Object.assign({},e.defines),uniforms:this.uniforms,vertexShader:e.vertexShader,fragmentShader:e.fragmentShader})),this._fsQuad=new J(this.material)}render(e,t,n){this.uniforms[this.textureID]&&(this.uniforms[this.textureID].value=n.texture),this._fsQuad.material=this.material,this.renderToScreen?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},X=class extends q{constructor(e,t){super(),this.scene=e,this.camera=t,this.clear=!0,this.needsSwap=!1,this.inverse=!1}render(e,t,n){let r=e.getContext(),i=e.state;i.buffers.color.setMask(!1),i.buffers.depth.setMask(!1),i.buffers.color.setLocked(!0),i.buffers.depth.setLocked(!0);let a,o;this.inverse?(a=0,o=1):(a=1,o=0),i.buffers.stencil.setTest(!0),i.buffers.stencil.setOp(r.REPLACE,r.REPLACE,r.REPLACE),i.buffers.stencil.setFunc(r.ALWAYS,a,4294967295),i.buffers.stencil.setClear(o),i.buffers.stencil.setLocked(!0),e.setRenderTarget(n),this.clear&&e.clear(),e.render(this.scene,this.camera),e.setRenderTarget(t),this.clear&&e.clear(),e.render(this.scene,this.camera),i.buffers.color.setLocked(!1),i.buffers.depth.setLocked(!1),i.buffers.color.setMask(!0),i.buffers.depth.setMask(!0),i.buffers.stencil.setLocked(!1),i.buffers.stencil.setFunc(r.EQUAL,1,4294967295),i.buffers.stencil.setOp(r.KEEP,r.KEEP,r.KEEP),i.buffers.stencil.setLocked(!0)}},Ee=class extends q{constructor(){super(),this.needsSwap=!1}render(e){e.state.buffers.stencil.setLocked(!1),e.state.buffers.stencil.setTest(!1)}},De=class{constructor(e,t){if(this.renderer=e,this._pixelRatio=e.getPixelRatio(),t===void 0){let n=e.getSize(new E);this._width=n.width,this._height=n.height,t=new I(this._width*this._pixelRatio,this._height*this._pixelRatio,{type:A}),t.texture.name=`EffectComposer.rt1`}else this._width=t.width,this._height=t.height;this.renderTarget1=t,this.renderTarget2=t.clone(),this.renderTarget2.texture.name=`EffectComposer.rt2`,this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2,this.renderToScreen=!0,this.passes=[],this.copyPass=new Y(K),this.copyPass.material.blending=0,this.timer=new v}swapBuffers(){let e=this.readBuffer;this.readBuffer=this.writeBuffer,this.writeBuffer=e}addPass(e){this.passes.push(e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}insertPass(e,t){this.passes.splice(t,0,e),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}removePass(e){let t=this.passes.indexOf(e);t!==-1&&this.passes.splice(t,1)}isLastEnabledPass(e){for(let t=e+1;t<this.passes.length;t++)if(this.passes[t].enabled)return!1;return!0}render(e){this.timer.update(),e===void 0&&(e=this.timer.getDelta());let t=this.renderer.getRenderTarget(),n=!1;for(let t=0,r=this.passes.length;t<r;t++){let r=this.passes[t];if(r.enabled!==!1){if(r.renderToScreen=this.renderToScreen&&this.isLastEnabledPass(t),r.render(this.renderer,this.writeBuffer,this.readBuffer,e,n),r.needsSwap){if(n){let t=this.renderer.getContext(),n=this.renderer.state.buffers.stencil;n.setFunc(t.NOTEQUAL,1,4294967295),this.copyPass.render(this.renderer,this.writeBuffer,this.readBuffer,e),n.setFunc(t.EQUAL,1,4294967295)}this.swapBuffers()}X!==void 0&&(r instanceof X?n=!0:r instanceof Ee&&(n=!1))}}this.renderer.setRenderTarget(t)}reset(e){if(e===void 0){let t=this.renderer.getSize(new E);this._pixelRatio=this.renderer.getPixelRatio(),this._width=t.width,this._height=t.height,e=this.renderTarget1.clone(),e.setSize(this._width*this._pixelRatio,this._height*this._pixelRatio)}this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.renderTarget1=e,this.renderTarget2=e.clone(),this.writeBuffer=this.renderTarget1,this.readBuffer=this.renderTarget2}setSize(e,t){this._width=e,this._height=t;let n=this._width*this._pixelRatio,r=this._height*this._pixelRatio;this.renderTarget1.setSize(n,r),this.renderTarget2.setSize(n,r);for(let e=0;e<this.passes.length;e++)this.passes[e].setSize(n,r)}setPixelRatio(e){this._pixelRatio=e,this.setSize(this._width,this._height)}dispose(){this.renderTarget1.dispose(),this.renderTarget2.dispose(),this.copyPass.dispose()}},Oe={name:`GTAOShader`,defines:{PERSPECTIVE_CAMERA:1,SAMPLES:16,NORMAL_VECTOR_TYPE:1,SCREEN_SPACE_RADIUS:0,SCREEN_SPACE_RADIUS_SCALE:100,SCENE_CLIP_BOX:0},uniforms:{tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new E},cameraNear:{value:null},cameraFar:{value:null},cameraProjectionMatrix:{value:new V},cameraProjectionMatrixInverse:{value:new V},cameraWorldMatrix:{value:new V},radius:{value:.25},distanceExponent:{value:1},thickness:{value:1},distanceFallOff:{value:1},scale:{value:1},sceneBoxMin:{value:new B(-1,-1,-1)},sceneBoxMax:{value:new B(1,1,1)}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		varying vec2 vUv;
		uniform highp sampler2D tNormal;
		uniform highp sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform float cameraNear;
		uniform float cameraFar;
		uniform mat4 cameraProjectionMatrix;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform mat4 cameraWorldMatrix;
		uniform float radius;
		uniform float distanceExponent;
		uniform float thickness;
		uniform float distanceFallOff;
		uniform float scale;
		#if SCENE_CLIP_BOX == 1
			uniform vec3 sceneBoxMin;
			uniform vec3 sceneBoxMax;
		#endif

		#include <common>
		#include <packing>

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(vec3(ao), 1.)
		#endif

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
			return textureLod(tDepth, uv.xy, 0.0).r;
		}

		float fetchDepth(const ivec2 uv) {
			return texelFetch(tDepth, uv.xy, 0).r;
		}

		float getViewZ(const in float depth) {
			#if PERSPECTIVE_CAMERA == 1
				return perspectiveDepthToViewZ(depth, cameraNear, cameraFar);
			#else
				return orthographicDepthToViewZ(depth, cameraNear, cameraFar);
			#endif
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ? ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz : -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ? ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz : -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
			#if NORMAL_VECTOR_TYPE == 2
				return normalize(textureLod(tNormal, uv, 0.).rgb);
			#elif NORMAL_VECTOR_TYPE == 1
				return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
			#else
				return computeNormalFromDepth(uv);
			#endif
		}

		vec3 getSceneUvAndDepth(vec3 sampleViewPos) {
			vec4 sampleClipPos = cameraProjectionMatrix * vec4(sampleViewPos, 1.);
			vec2 sampleUv = sampleClipPos.xy / sampleClipPos.w * 0.5 + 0.5;
			float sampleSceneDepth = getDepth(sampleUv);
			return vec3(sampleUv, sampleSceneDepth);
		}

		void main() {
			float depth = getDepth(vUv.xy);

			#ifdef USE_REVERSED_DEPTH_BUFFER
				if (depth <= 0.0) {
					discard;
					return;
				}
			#else
				if (depth >= 1.0) {
					discard;
					return;
				}
			#endif
			
			vec3 viewPos = getViewPosition(vUv, depth);
			vec3 viewNormal = getViewNormal(vUv);

			float radiusToUse = radius;
			float distanceFalloffToUse = thickness;
			#if SCREEN_SPACE_RADIUS == 1
				float radiusScale = getViewPosition(vec2(0.5 + float(SCREEN_SPACE_RADIUS_SCALE) / resolution.x, 0.0), depth).x;
				radiusToUse *= radiusScale;
				distanceFalloffToUse *= radiusScale;
			#endif

			#if SCENE_CLIP_BOX == 1
				vec3 worldPos = (cameraWorldMatrix * vec4(viewPos, 1.0)).xyz;
				float boxDistance = length(max(vec3(0.0), max(sceneBoxMin - worldPos, worldPos - sceneBoxMax)));
				if (boxDistance > radiusToUse) {
					discard;
					return;
				}
			#endif

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
			vec3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
			vec3 tangent = normalize(vec3(randomVec.xy, 0.));
			vec3 bitangent = vec3(-tangent.y, tangent.x, 0.);
			mat3 kernelMatrix = mat3(tangent, bitangent, vec3(0., 0., 1.));

			const int DIRECTIONS = SAMPLES < 30 ? 3 : 5;
			const int STEPS = (SAMPLES + DIRECTIONS - 1) / DIRECTIONS;
			float ao = 0.0;
			for (int i = 0; i < DIRECTIONS; ++i) {

				float angle = float(i) / float(DIRECTIONS) * PI;
				vec4 sampleDir = vec4(cos(angle), sin(angle), 0., 0.5 + 0.5 * noiseTexel.w);
				sampleDir.xyz = normalize(kernelMatrix * sampleDir.xyz);

				#if PERSPECTIVE_CAMERA == 1
					vec3 viewDir = normalize(-viewPos.xyz);
				#else
					vec3 viewDir = vec3(0., 0., 1.);
				#endif
				vec3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
				vec3 sliceTangent = cross(sliceBitangent, viewDir);
				vec3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));

				vec3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
				vec2 cosHorizons = vec2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));

				for (int j = 0; j < STEPS; ++j) {
					vec3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), distanceExponent);

					vec3 sampleSceneUvDepth = getSceneUvAndDepth(viewPos + sampleViewOffset);
					vec3 sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					vec3 viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.x += max(0., (sampleCosHorizon - cosHorizons.x) * mix(1., 2. / float(j + 2), distanceFallOff));
					}

					sampleSceneUvDepth = getSceneUvAndDepth(viewPos - sampleViewOffset);
					sampleSceneViewPos = getViewPosition(sampleSceneUvDepth.xy, sampleSceneUvDepth.z);
					viewDelta = sampleSceneViewPos - viewPos;
					if (abs(viewDelta.z) < thickness) {
						float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
						cosHorizons.y += max(0., (sampleCosHorizon - cosHorizons.y) * mix(1., 2. / float(j + 2), distanceFallOff));
					}
				}

				vec2 sinHorizons = sqrt(1. - cosHorizons * cosHorizons);
				float nx = dot(normalInSlice, sliceTangent);
				float ny = dot(normalInSlice, viewDir);
				float nxb = 1. / 2. * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
				float nyb = 1. / 2. * (2. - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
				float occlusion = nx * nxb + ny * nyb;
				ao += occlusion;
			}

			ao = clamp(ao / float(DIRECTIONS), 0., 1.);
		#if SCENE_CLIP_BOX == 1
			ao = mix(ao, 1., smoothstep(0., radiusToUse, boxDistance));
		#endif
			ao = pow(ao, scale);

			gl_FragColor = FRAGMENT_OUTPUT;
		}`},ke={name:`GTAODepthShader`,defines:{PERSPECTIVE_CAMERA:1},uniforms:{tDepth:{value:null},cameraNear:{value:null},cameraFar:{value:null}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform sampler2D tDepth;
		uniform float cameraNear;
		uniform float cameraFar;
		varying vec2 vUv;

		#include <packing>

		float getLinearDepth( const in vec2 screenPosition ) {
			#if PERSPECTIVE_CAMERA == 1
				float fragCoordZ = texture2D( tDepth, screenPosition ).x;
				float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );
				return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );
			#else
				return texture2D( tDepth, screenPosition ).x;
			#endif
		}

		void main() {
			float depth = getLinearDepth( vUv );
			gl_FragColor = vec4( vec3( 1.0 - depth ), 1.0 );

		}`},Ae={name:`GTAOBlendShader`,uniforms:{tDiffuse:{value:null},intensity:{value:1}},vertexShader:`
		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`
		uniform float intensity;
		uniform sampler2D tDiffuse;
		varying vec2 vUv;

		void main() {
			vec4 texel = texture2D( tDiffuse, vUv );
			gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a);
		}`};function je(e=5){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),r=Me(t),i=r.length,a=new Uint8Array(i*4);for(let e=0;e<i;++e){let t=r[e],n=2*Math.PI*t/i,o=new B(Math.cos(n),Math.sin(n),0).normalize();a[e*4]=(o.x*.5+.5)*255,a[e*4+1]=(o.y*.5+.5)*255,a[e*4+2]=127,a[e*4+3]=255}let o=new C(a,t,t);return o.wrapS=n,o.wrapT=n,o.needsUpdate=!0,o}function Me(e){let t=Math.floor(e)%2==0?Math.floor(e)+1:Math.floor(e),n=t*t,r=Array(n).fill(0),i=Math.floor(t/2),a=t-1;for(let e=1;e<=n;)i===-1&&a===t?(a=t-2,i=0):(a===t&&(a=0),i<0&&(i=t-1)),r[i*t+a]===0?(r[i*t+a]=e++,a++,i--):(a-=2,i++);return r}var Ne={name:`PoissonDenoiseShader`,defines:{SAMPLES:16,SAMPLE_VECTORS:Pe(16,2,1),NORMAL_VECTOR_TYPE:1},uniforms:{tDiffuse:{value:null},tNormal:{value:null},tDepth:{value:null},tNoise:{value:null},resolution:{value:new E},cameraProjectionMatrixInverse:{value:new V},lumaPhi:{value:5},depthPhi:{value:5},normalPhi:{value:5},radius:{value:4},index:{value:0}},vertexShader:`

		varying vec2 vUv;

		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,fragmentShader:`

		varying vec2 vUv;

		uniform sampler2D tDiffuse;
		uniform sampler2D tNormal;
		uniform sampler2D tDepth;
		uniform sampler2D tNoise;
		uniform vec2 resolution;
		uniform mat4 cameraProjectionMatrixInverse;
		uniform float lumaPhi;
		uniform float depthPhi;
		uniform float normalPhi;
		uniform float radius;
		uniform int index;

		#include <common>
		#include <packing>

		#ifndef SAMPLE_LUMINANCE
		#define SAMPLE_LUMINANCE dot(vec3(0.2125, 0.7154, 0.0721), a)
		#endif

		#ifndef FRAGMENT_OUTPUT
		#define FRAGMENT_OUTPUT vec4(denoised, 1.)
		#endif

		float getLuminance(const in vec3 a) {
			return SAMPLE_LUMINANCE;
		}

		const vec3 poissonDisk[SAMPLES] = SAMPLE_VECTORS;

		vec3 getViewPosition( const in vec2 screenPosition, const in float depth ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				vec4 clipSpacePosition = vec4( vec2( screenPosition ) * 2.0 - 1.0, depth, 1.0 );
			#else
				vec4 clipSpacePosition = vec4( vec3( screenPosition, depth ) * 2.0 - 1.0, 1.0 );
			#endif
			vec4 viewSpacePosition = cameraProjectionMatrixInverse * clipSpacePosition;
			return viewSpacePosition.xyz / viewSpacePosition.w;
		}

		float getDepth(const vec2 uv) {
			return textureLod(tDepth, uv.xy, 0.0).r;
		}

		float fetchDepth(const ivec2 uv) {
			return texelFetch(tDepth, uv.xy, 0).r;
		}

		vec3 computeNormalFromDepth(const vec2 uv) {
			vec2 size = vec2(textureSize(tDepth, 0));
			ivec2 p = ivec2(uv * size);
			float c0 = fetchDepth(p);
			float l2 = fetchDepth(p - ivec2(2, 0));
			float l1 = fetchDepth(p - ivec2(1, 0));
			float r1 = fetchDepth(p + ivec2(1, 0));
			float r2 = fetchDepth(p + ivec2(2, 0));
			float b2 = fetchDepth(p - ivec2(0, 2));
			float b1 = fetchDepth(p - ivec2(0, 1));
			float t1 = fetchDepth(p + ivec2(0, 1));
			float t2 = fetchDepth(p + ivec2(0, 2));
			float dl = abs((2.0 * l1 - l2) - c0);
			float dr = abs((2.0 * r1 - r2) - c0);
			float db = abs((2.0 * b1 - b2) - c0);
			float dt = abs((2.0 * t1 - t2) - c0);
			vec3 ce = getViewPosition(uv, c0).xyz;
			vec3 dpdx = (dl < dr) ?  ce - getViewPosition((uv - vec2(1.0 / size.x, 0.0)), l1).xyz
									: -ce + getViewPosition((uv + vec2(1.0 / size.x, 0.0)), r1).xyz;
			vec3 dpdy = (db < dt) ?  ce - getViewPosition((uv - vec2(0.0, 1.0 / size.y)), b1).xyz
									: -ce + getViewPosition((uv + vec2(0.0, 1.0 / size.y)), t1).xyz;
			return normalize(cross(dpdx, dpdy));
		}

		vec3 getViewNormal(const vec2 uv) {
		#if NORMAL_VECTOR_TYPE == 2
			return normalize(textureLod(tNormal, uv, 0.).rgb);
		#elif NORMAL_VECTOR_TYPE == 1
			return unpackRGBToNormal(textureLod(tNormal, uv, 0.).rgb);
		#else
			return computeNormalFromDepth(uv);
		#endif
		}

		void denoiseSample(in vec3 center, in vec3 viewNormal, in vec3 viewPos, in vec2 sampleUv, inout vec3 denoised, inout float totalWeight) {
			vec4 sampleTexel = textureLod(tDiffuse, sampleUv, 0.0);
			float sampleDepth = getDepth(sampleUv);
			vec3 sampleNormal = getViewNormal(sampleUv);
			vec3 neighborColor = sampleTexel.rgb;
			vec3 viewPosSample = getViewPosition(sampleUv, sampleDepth);

			float normalDiff = dot(viewNormal, sampleNormal);
			float normalSimilarity = pow(max(normalDiff, 0.), normalPhi);
			float lumaDiff = abs(getLuminance(neighborColor) - getLuminance(center));
			float lumaSimilarity = max(1.0 - lumaDiff / lumaPhi, 0.0);
			float depthDiff = abs(dot(viewPos - viewPosSample, viewNormal));
			float depthSimilarity = max(1. - depthDiff / depthPhi, 0.);
			float w = lumaSimilarity * depthSimilarity * normalSimilarity;

			denoised += w * neighborColor;
			totalWeight += w;
		}

		void main() {
			float depth = getDepth(vUv.xy);
			vec3 viewNormal = getViewNormal(vUv);
			if (depth == 1. || dot(viewNormal, viewNormal) == 0.) {
				discard;
				return;
			}
			vec4 texel = textureLod(tDiffuse, vUv, 0.0);
			vec3 center = texel.rgb;
			vec3 viewPos = getViewPosition(vUv, depth);

			vec2 noiseResolution = vec2(textureSize(tNoise, 0));
			vec2 noiseUv = vUv * resolution / noiseResolution;
			vec4 noiseTexel = textureLod(tNoise, noiseUv, 0.0);
      		vec2 noiseVec = vec2(sin(noiseTexel[index % 4] * 2. * PI), cos(noiseTexel[index % 4] * 2. * PI));
    		mat2 rotationMatrix = mat2(noiseVec.x, -noiseVec.y, noiseVec.x, noiseVec.y);

			float totalWeight = 1.0;
			vec3 denoised = texel.rgb;
			for (int i = 0; i < SAMPLES; i++) {
				vec3 sampleDir = poissonDisk[i];
				vec2 offset = rotationMatrix * (sampleDir.xy * (1. + sampleDir.z * (radius - 1.)) / resolution);
				vec2 sampleUv = vUv + offset;
				denoiseSample(center, viewNormal, viewPos, sampleUv, denoised, totalWeight);
			}

			if (totalWeight > 0.) {
				denoised /= totalWeight;
			}
			gl_FragColor = FRAGMENT_OUTPUT;
		}`};function Pe(e,t,n){let r=Fe(e,t,n),i=`vec3[SAMPLES](`;for(let t=0;t<e;t++){let n=r[t];i+=`vec3(${n.x}, ${n.y}, ${n.z})${t<e-1?`,`:`)`}`}return i}function Fe(e,t,n){let r=[];for(let i=0;i<e;i++){let a=2*Math.PI*t*i/e,o=(i/(e-1))**n;r.push(new B(Math.cos(a),Math.sin(a),o))}return r}var Ie=class{constructor(e=Math){this.grad3=[[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]],this.grad4=[[0,1,1,1],[0,1,1,-1],[0,1,-1,1],[0,1,-1,-1],[0,-1,1,1],[0,-1,1,-1],[0,-1,-1,1],[0,-1,-1,-1],[1,0,1,1],[1,0,1,-1],[1,0,-1,1],[1,0,-1,-1],[-1,0,1,1],[-1,0,1,-1],[-1,0,-1,1],[-1,0,-1,-1],[1,1,0,1],[1,1,0,-1],[1,-1,0,1],[1,-1,0,-1],[-1,1,0,1],[-1,1,0,-1],[-1,-1,0,1],[-1,-1,0,-1],[1,1,1,0],[1,1,-1,0],[1,-1,1,0],[1,-1,-1,0],[-1,1,1,0],[-1,1,-1,0],[-1,-1,1,0],[-1,-1,-1,0]],this.p=[];for(let t=0;t<256;t++)this.p[t]=Math.floor(e.random()*256);this.perm=[];for(let e=0;e<512;e++)this.perm[e]=this.p[e&255];this.simplex=[[0,1,2,3],[0,1,3,2],[0,0,0,0],[0,2,3,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,3,0],[0,2,1,3],[0,0,0,0],[0,3,1,2],[0,3,2,1],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,3,2,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[1,2,0,3],[0,0,0,0],[1,3,0,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,3,0,1],[2,3,1,0],[1,0,2,3],[1,0,3,2],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,3,1],[0,0,0,0],[2,1,3,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0],[2,0,1,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,0,1,2],[3,0,2,1],[0,0,0,0],[3,1,2,0],[2,1,0,3],[0,0,0,0],[0,0,0,0],[0,0,0,0],[3,1,0,2],[0,0,0,0],[3,2,0,1],[3,2,1,0]]}noise(e,t){let n,r,i,a=.5*(Math.sqrt(3)-1),o=(e+t)*a,s=Math.floor(e+o),c=Math.floor(t+o),l=(3-Math.sqrt(3))/6,u=(s+c)*l,d=s-u,f=c-u,p=e-d,m=t-f,h,g;p>m?(h=1,g=0):(h=0,g=1);let _=p-h+l,v=m-g+l,y=p-1+2*l,b=m-1+2*l,x=s&255,S=c&255,C=this.perm[x+this.perm[S]]%12,w=this.perm[x+h+this.perm[S+g]]%12,T=this.perm[x+1+this.perm[S+1]]%12,E=.5-p*p-m*m;E<0?n=0:(E*=E,n=E*E*this._dot(this.grad3[C],p,m));let D=.5-_*_-v*v;D<0?r=0:(D*=D,r=D*D*this._dot(this.grad3[w],_,v));let O=.5-y*y-b*b;return O<0?i=0:(O*=O,i=O*O*this._dot(this.grad3[T],y,b)),70*(n+r+i)}noise3d(e,t,n){let r,i,a,o,s=(e+t+n)*(1/3),c=Math.floor(e+s),l=Math.floor(t+s),u=Math.floor(n+s),d=1/6,f=(c+l+u)*d,p=c-f,m=l-f,h=u-f,g=e-p,_=t-m,v=n-h,y,b,x,S,C,w;g>=_?_>=v?(y=1,b=0,x=0,S=1,C=1,w=0):g>=v?(y=1,b=0,x=0,S=1,C=0,w=1):(y=0,b=0,x=1,S=1,C=0,w=1):_<v?(y=0,b=0,x=1,S=0,C=1,w=1):g<v?(y=0,b=1,x=0,S=0,C=1,w=1):(y=0,b=1,x=0,S=1,C=1,w=0);let T=g-y+d,E=_-b+d,D=v-x+d,O=g-S+2*d,k=_-C+2*d,ee=v-w+2*d,A=g-1+3*d,j=_-1+3*d,te=v-1+3*d,M=c&255,N=l&255,P=u&255,ne=this.perm[M+this.perm[N+this.perm[P]]]%12,re=this.perm[M+y+this.perm[N+b+this.perm[P+x]]]%12,F=this.perm[M+S+this.perm[N+C+this.perm[P+w]]]%12,ie=this.perm[M+1+this.perm[N+1+this.perm[P+1]]]%12,I=.6-g*g-_*_-v*v;I<0?r=0:(I*=I,r=I*I*this._dot3(this.grad3[ne],g,_,v));let L=.6-T*T-E*E-D*D;L<0?i=0:(L*=L,i=L*L*this._dot3(this.grad3[re],T,E,D));let R=.6-O*O-k*k-ee*ee;R<0?a=0:(R*=R,a=R*R*this._dot3(this.grad3[F],O,k,ee));let z=.6-A*A-j*j-te*te;return z<0?o=0:(z*=z,o=z*z*this._dot3(this.grad3[ie],A,j,te)),32*(r+i+a+o)}noise4d(e,t,n,r){let i=this.grad4,a=this.simplex,o=this.perm,s=(Math.sqrt(5)-1)/4,c=(5-Math.sqrt(5))/20,l,u,d,f,p,m=(e+t+n+r)*s,h=Math.floor(e+m),g=Math.floor(t+m),_=Math.floor(n+m),v=Math.floor(r+m),y=(h+g+_+v)*c,b=h-y,x=g-y,S=_-y,C=v-y,w=e-b,T=t-x,E=n-S,D=r-C,O=w>T?32:0,k=w>E?16:0,ee=T>E?8:0,A=w>D?4:0,j=T>D?2:0,te=+(E>D),M=O+k+ee+A+j+te,N=+(a[M][0]>=3),P=+(a[M][1]>=3),ne=+(a[M][2]>=3),re=+(a[M][3]>=3),F=+(a[M][0]>=2),ie=+(a[M][1]>=2),I=+(a[M][2]>=2),L=+(a[M][3]>=2),R=+(a[M][0]>=1),z=+(a[M][1]>=1),B=+(a[M][2]>=1),V=+(a[M][3]>=1),ae=w-N+c,H=T-P+c,oe=E-ne+c,se=D-re+c,U=w-F+2*c,ce=T-ie+2*c,le=E-I+2*c,ue=D-L+2*c,de=w-R+3*c,fe=T-z+3*c,pe=E-B+3*c,me=D-V+3*c,he=w-1+4*c,W=T-1+4*c,ge=E-1+4*c,_e=D-1+4*c,ve=h&255,ye=g&255,be=_&255,G=v&255,xe=o[ve+o[ye+o[be+o[G]]]]%32,Se=o[ve+N+o[ye+P+o[be+ne+o[G+re]]]]%32,Ce=o[ve+F+o[ye+ie+o[be+I+o[G+L]]]]%32,K=o[ve+R+o[ye+z+o[be+B+o[G+V]]]]%32,q=o[ve+1+o[ye+1+o[be+1+o[G+1]]]]%32,we=.6-w*w-T*T-E*E-D*D;we<0?l=0:(we*=we,l=we*we*this._dot4(i[xe],w,T,E,D));let Te=.6-ae*ae-H*H-oe*oe-se*se;Te<0?u=0:(Te*=Te,u=Te*Te*this._dot4(i[Se],ae,H,oe,se));let J=.6-U*U-ce*ce-le*le-ue*ue;J<0?d=0:(J*=J,d=J*J*this._dot4(i[Ce],U,ce,le,ue));let Y=.6-de*de-fe*fe-pe*pe-me*me;Y<0?f=0:(Y*=Y,f=Y*Y*this._dot4(i[K],de,fe,pe,me));let X=.6-he*he-W*W-ge*ge-_e*_e;return X<0?p=0:(X*=X,p=X*X*this._dot4(i[q],he,W,ge,_e)),27*(l+u+d+f+p)}_dot(e,t,n){return e[0]*t+e[1]*n}_dot3(e,t,n,r){return e[0]*t+e[1]*n+e[2]*r}_dot4(e,t,n,r,i){return e[0]*t+e[1]*n+e[2]*r+e[3]*i}},Le=class t extends q{constructor(e,t,n=512,r=512,i,a,o){super(),this.width=n,this.height=r,this.clear=!0,this.camera=t,this.scene=e,this.output=0,this._renderGBuffer=!0,this._visibilityCache=[],this.blendIntensity=1,this.pdRings=2,this.pdRadiusExponent=2,this.pdSamples=16,this.gtaoNoiseTexture=je(),this.pdNoiseTexture=this._generateNoise(),this.gtaoRenderTarget=new I(this.width,this.height,{type:A,depthBuffer:!1}),this.pdRenderTarget=this.gtaoRenderTarget.clone(),this.gtaoMaterial=new c({defines:Object.assign({},Oe.defines),uniforms:y.clone(Oe.uniforms),vertexShader:Oe.vertexShader,fragmentShader:Oe.fragmentShader,blending:0,depthTest:!1,depthWrite:!1}),this.gtaoMaterial.defines.PERSPECTIVE_CAMERA=+!!this.camera.isPerspectiveCamera,this.gtaoMaterial.uniforms.tNoise.value=this.gtaoNoiseTexture,this.gtaoMaterial.uniforms.resolution.value.set(this.width,this.height),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.normalMaterial=new S,this.normalMaterial.blending=0,this.pdMaterial=new c({defines:Object.assign({},Ne.defines),uniforms:y.clone(Ne.uniforms),vertexShader:Ne.vertexShader,fragmentShader:Ne.fragmentShader,depthTest:!1,depthWrite:!1}),this.pdMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.pdMaterial.uniforms.tNoise.value=this.pdNoiseTexture,this.pdMaterial.uniforms.resolution.value.set(this.width,this.height),this.pdMaterial.uniforms.lumaPhi.value=10,this.pdMaterial.uniforms.depthPhi.value=2,this.pdMaterial.uniforms.normalPhi.value=3,this.pdMaterial.uniforms.radius.value=8,this.depthRenderMaterial=new c({defines:Object.assign({},ke.defines),uniforms:y.clone(ke.uniforms),vertexShader:ke.vertexShader,fragmentShader:ke.fragmentShader,blending:0}),this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this.copyMaterial=new c({uniforms:y.clone(K.uniforms),vertexShader:K.vertexShader,fragmentShader:K.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this.blendMaterial=new c({uniforms:y.clone(Ae.uniforms),vertexShader:Ae.vertexShader,fragmentShader:Ae.fragmentShader,transparent:!0,depthTest:!1,depthWrite:!1,blending:5,blendSrc:208,blendDst:200,blendEquation:100,blendSrcAlpha:206,blendDstAlpha:200,blendEquationAlpha:100}),this._fsQuad=new J(null),this._originalClearColor=new k,this.setGBuffer(i?i.depthTexture:void 0,i?i.normalTexture:void 0),a!==void 0&&this.updateGtaoMaterial(a),o!==void 0&&this.updatePdMaterial(o)}setSize(e,t){this.width=e,this.height=t,this.gtaoRenderTarget.setSize(e,t),this.normalRenderTarget&&this.normalRenderTarget.setSize(e,t),this.pdRenderTarget.setSize(e,t),this.gtaoMaterial.uniforms.resolution.value.set(e,t),this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.pdMaterial.uniforms.resolution.value.set(e,t),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse)}dispose(){this.gtaoNoiseTexture.dispose(),this.pdNoiseTexture.dispose(),this.normalRenderTarget&&this.normalRenderTarget.dispose(),this.gtaoRenderTarget.dispose(),this.pdRenderTarget.dispose(),this.normalMaterial.dispose(),this.pdMaterial.dispose(),this.copyMaterial.dispose(),this.depthRenderMaterial.dispose(),this._fsQuad.dispose()}get gtaoMap(){return this.pdRenderTarget.texture}setGBuffer(t,n){if(t!==void 0)this.depthTexture=t,this.normalTexture=n,this._renderGBuffer=!1;else{if(this.normalRenderTarget===void 0){let t=new g;t.format=se,t.type=e,this.normalRenderTarget=new I(this.width,this.height,{minFilter:N,magFilter:N,type:A,depthTexture:t})}this.depthTexture=this.normalRenderTarget.depthTexture,this.normalTexture=this.normalRenderTarget.texture,this._renderGBuffer=!0}let r=+!!this.normalTexture;this.gtaoMaterial.defines.NORMAL_VECTOR_TYPE=r,this.gtaoMaterial.needsUpdate=!0,this.gtaoMaterial.uniforms.tNormal.value=this.normalTexture,this.gtaoMaterial.uniforms.tDepth.value=this.depthTexture,this.pdMaterial.defines.NORMAL_VECTOR_TYPE=r,this.pdMaterial.needsUpdate=!0,this.pdMaterial.uniforms.tNormal.value=this.normalTexture,this.pdMaterial.uniforms.tDepth.value=this.depthTexture,this.depthRenderMaterial.uniforms.tDepth.value=this.depthTexture}setSceneClipBox(e){e?(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX!==1,this.gtaoMaterial.defines.SCENE_CLIP_BOX=1,this.gtaoMaterial.uniforms.sceneBoxMin.value.copy(e.min),this.gtaoMaterial.uniforms.sceneBoxMax.value.copy(e.max)):(this.gtaoMaterial.needsUpdate=this.gtaoMaterial.defines.SCENE_CLIP_BOX===0,this.gtaoMaterial.defines.SCENE_CLIP_BOX=0)}updateGtaoMaterial(e){e.radius!==void 0&&(this.gtaoMaterial.uniforms.radius.value=e.radius),e.distanceExponent!==void 0&&(this.gtaoMaterial.uniforms.distanceExponent.value=e.distanceExponent),e.thickness!==void 0&&(this.gtaoMaterial.uniforms.thickness.value=e.thickness),e.distanceFallOff!==void 0&&(this.gtaoMaterial.uniforms.distanceFallOff.value=e.distanceFallOff,this.gtaoMaterial.needsUpdate=!0),e.scale!==void 0&&(this.gtaoMaterial.uniforms.scale.value=e.scale),e.samples!==void 0&&e.samples!==this.gtaoMaterial.defines.SAMPLES&&(this.gtaoMaterial.defines.SAMPLES=e.samples,this.gtaoMaterial.needsUpdate=!0),e.screenSpaceRadius!==void 0&&+!!e.screenSpaceRadius!==this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS&&(this.gtaoMaterial.defines.SCREEN_SPACE_RADIUS=+!!e.screenSpaceRadius,this.gtaoMaterial.needsUpdate=!0)}updatePdMaterial(e){let t=!1;e.lumaPhi!==void 0&&(this.pdMaterial.uniforms.lumaPhi.value=e.lumaPhi),e.depthPhi!==void 0&&(this.pdMaterial.uniforms.depthPhi.value=e.depthPhi),e.normalPhi!==void 0&&(this.pdMaterial.uniforms.normalPhi.value=e.normalPhi),e.radius!==void 0&&e.radius!==this.radius&&(this.pdMaterial.uniforms.radius.value=e.radius),e.radiusExponent!==void 0&&e.radiusExponent!==this.pdRadiusExponent&&(this.pdRadiusExponent=e.radiusExponent,t=!0),e.rings!==void 0&&e.rings!==this.pdRings&&(this.pdRings=e.rings,t=!0),e.samples!==void 0&&e.samples!==this.pdSamples&&(this.pdSamples=e.samples,t=!0),t&&(this.pdMaterial.defines.SAMPLES=this.pdSamples,this.pdMaterial.defines.SAMPLE_VECTORS=Pe(this.pdSamples,this.pdRings,this.pdRadiusExponent),this.pdMaterial.needsUpdate=!0)}render(e,n,r){switch(this._renderGBuffer&&(this._overrideVisibility(),this._renderOverride(e,this.normalMaterial,this.normalRenderTarget,7829503,1),this._restoreVisibility()),this.gtaoMaterial.uniforms.cameraNear.value=this.camera.near,this.gtaoMaterial.uniforms.cameraFar.value=this.camera.far,this.gtaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix),this.gtaoMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this.gtaoMaterial.uniforms.cameraWorldMatrix.value.copy(this.camera.matrixWorld),this._renderPass(e,this.gtaoMaterial,this.gtaoRenderTarget,16777215,1),this.pdMaterial.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse),this._renderPass(e,this.pdMaterial,this.pdRenderTarget,16777215,1),this.output){case t.OUTPUT.Off:break;case t.OUTPUT.Diffuse:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:n);break;case t.OUTPUT.AO:this.copyMaterial.uniforms.tDiffuse.value=this.gtaoRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:n);break;case t.OUTPUT.Denoise:this.copyMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this.copyMaterial.blending=0,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:n);break;case t.OUTPUT.Depth:this.depthRenderMaterial.uniforms.cameraNear.value=this.camera.near,this.depthRenderMaterial.uniforms.cameraFar.value=this.camera.far,this._renderPass(e,this.depthRenderMaterial,this.renderToScreen?null:n);break;case t.OUTPUT.Normal:this.copyMaterial.uniforms.tDiffuse.value=this.normalTexture||null,this.copyMaterial.blending=0,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:n);break;case t.OUTPUT.Default:this.copyMaterial.uniforms.tDiffuse.value=r.texture,this.copyMaterial.blending=0,this._renderPass(e,this.copyMaterial,this.renderToScreen?null:n),this.blendMaterial.uniforms.intensity.value=this.blendIntensity,this.blendMaterial.uniforms.tDiffuse.value=this.pdRenderTarget.texture,this._renderPass(e,this.blendMaterial,this.renderToScreen?null:n);break;default:console.warn(`THREE.GTAOPass: Unknown output type.`)}}_renderPass(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this._fsQuad.material=t,this._fsQuad.render(e),e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_renderOverride(e,t,n,r,i){e.getClearColor(this._originalClearColor);let a=e.getClearAlpha(),o=e.autoClear;e.setRenderTarget(n),e.autoClear=!1,r=t.clearColor||r,i=t.clearAlpha||i,r!=null&&(e.setClearColor(r),e.setClearAlpha(i||0),e.clear()),this.scene.overrideMaterial=t,e.render(this.scene,this.camera),this.scene.overrideMaterial=null,e.autoClear=o,e.setClearColor(this._originalClearColor),e.setClearAlpha(a)}_overrideVisibility(){let e=this.scene,t=this._visibilityCache;e.traverse(function(e){(e.isPoints||e.isLine||e.isLine2)&&e.visible&&(e.visible=!1,t.push(e))})}_restoreVisibility(){let e=this._visibilityCache;for(let t=0;t<e.length;t++)e[t].visible=!0;e.length=0}_generateNoise(e=64){let t=new Ie,r=e*e*4,i=new Uint8Array(r);for(let n=0;n<e;n++)for(let r=0;r<e;r++){let a=n,o=r;i[(n*e+r)*4]=(t.noise(a,o)*.5+.5)*255,i[(n*e+r)*4+1]=(t.noise(a+e,o)*.5+.5)*255,i[(n*e+r)*4+2]=(t.noise(a,o+e)*.5+.5)*255,i[(n*e+r)*4+3]=(t.noise(a+e,o+e)*.5+.5)*255}let a=new C(i,e,e,s,h);return a.wrapS=n,a.wrapT=n,a.needsUpdate=!0,a}};Le.OUTPUT={Off:-1,Default:0,Diffuse:1,Depth:2,Normal:3,AO:4,Denoise:5};var Re={name:`OutputShader`,uniforms:{tDiffuse:{value:null},toneMappingExposure:{value:1}},vertexShader:`
		precision highp float;

		uniform mat4 modelViewMatrix;
		uniform mat4 projectionMatrix;

		attribute vec3 position;
		attribute vec2 uv;

		varying vec2 vUv;

		void main() {

			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

		}`,fragmentShader:`

		precision highp float;

		uniform sampler2D tDiffuse;

		#include <tonemapping_pars_fragment>
		#include <colorspace_pars_fragment>

		varying vec2 vUv;

		void main() {

			gl_FragColor = texture2D( tDiffuse, vUv );

			// tone mapping

			#ifdef LINEAR_TONE_MAPPING

				gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );

			#elif defined( REINHARD_TONE_MAPPING )

				gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );

			#elif defined( CINEON_TONE_MAPPING )

				gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );

			#elif defined( ACES_FILMIC_TONE_MAPPING )

				gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );

			#elif defined( AGX_TONE_MAPPING )

				gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );

			#elif defined( NEUTRAL_TONE_MAPPING )

				gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );

			#elif defined( CUSTOM_TONE_MAPPING )

				gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );

			#endif

			// color space

			#ifdef SRGB_TRANSFER

				gl_FragColor = sRGBTransferOETF( gl_FragColor );

			#endif

		}`},ze=class extends q{constructor(){super(),this.isOutputPass=!0,this.uniforms=y.clone(Re.uniforms),this.material=new o({name:Re.name,uniforms:this.uniforms,vertexShader:Re.vertexShader,fragmentShader:Re.fragmentShader}),this._fsQuad=new J(this.material),this._outputColorSpace=null,this._toneMapping=null}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,this.uniforms.toneMappingExposure.value=e.toneMappingExposure,(this._outputColorSpace!==e.outputColorSpace||this._toneMapping!==e.toneMapping)&&(this._outputColorSpace=e.outputColorSpace,this._toneMapping=e.toneMapping,this.material.defines={},D.getTransfer(this._outputColorSpace)===`srgb`&&(this.material.defines.SRGB_TRANSFER=``),this._toneMapping===1?this.material.defines.LINEAR_TONE_MAPPING=``:this._toneMapping===2?this.material.defines.REINHARD_TONE_MAPPING=``:this._toneMapping===3?this.material.defines.CINEON_TONE_MAPPING=``:this._toneMapping===4?this.material.defines.ACES_FILMIC_TONE_MAPPING=``:this._toneMapping===6?this.material.defines.AGX_TONE_MAPPING=``:this._toneMapping===7?this.material.defines.NEUTRAL_TONE_MAPPING=``:this._toneMapping===5&&(this.material.defines.CUSTOM_TONE_MAPPING=``),this.material.needsUpdate=!0),this.renderToScreen===!0?(e.setRenderTarget(null),this._fsQuad.render(e)):(e.setRenderTarget(t),this.clear&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),this._fsQuad.render(e))}dispose(){this.material.dispose(),this._fsQuad.dispose()}},Be=class extends q{constructor(e,t,n=null,r=null,i=null){super(),this.scene=e,this.camera=t,this.overrideMaterial=n,this.clearColor=r,this.clearAlpha=i,this.clear=!0,this.clearDepth=!1,this.needsSwap=!1,this.isRenderPass=!0,this._oldClearColor=new k}render(e,t,n){let r=e.autoClear;e.autoClear=!1;let i,a;this.overrideMaterial!==null&&(a=this.scene.overrideMaterial,this.scene.overrideMaterial=this.overrideMaterial),this.clearColor!==null&&(e.getClearColor(this._oldClearColor),e.setClearColor(this.clearColor,e.getClearAlpha())),this.clearAlpha!==null&&(i=e.getClearAlpha(),e.setClearAlpha(this.clearAlpha)),this.clearDepth==1&&e.clearDepth(),e.setRenderTarget(this.renderToScreen?null:n),this.clear===!0&&e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil),e.render(this.scene,this.camera),this.clearColor!==null&&e.setClearColor(this._oldClearColor),this.clearAlpha!==null&&e.setClearAlpha(i),this.overrideMaterial!==null&&(this.scene.overrideMaterial=a),e.autoClear=r}},Ve={name:`LuminosityHighPassShader`,uniforms:{tDiffuse:{value:null},luminosityThreshold:{value:1},smoothWidth:{value:1},defaultColor:{value:new k(0)},defaultOpacity:{value:0}},vertexShader:`

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

		}`},He=class e extends q{constructor(e,t=1,n,r){super(),this.strength=t,this.radius=n,this.threshold=r,this.resolution=e===void 0?new E(256,256):new E(e.x,e.y),this.clearColor=new k(0,0,0),this.needsSwap=!1,this.renderTargetsHorizontal=[],this.renderTargetsVertical=[],this.nMips=5;let i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);this.renderTargetBright=new I(i,a,{type:A,depthBuffer:!1}),this.renderTargetBright.texture.name=`UnrealBloomPass.bright`,this.renderTargetBright.texture.generateMipmaps=!1;for(let e=0;e<this.nMips;e++){let t=new I(i,a,{type:A,depthBuffer:!1});t.texture.name=`UnrealBloomPass.h`+e,t.texture.generateMipmaps=!1,this.renderTargetsHorizontal.push(t);let n=new I(i,a,{type:A,depthBuffer:!1});n.texture.name=`UnrealBloomPass.v`+e,n.texture.generateMipmaps=!1,this.renderTargetsVertical.push(n),i=Math.round(i/2),a=Math.round(a/2)}let o=Ve;this.highPassUniforms=y.clone(o.uniforms),this.highPassUniforms.luminosityThreshold.value=r,this.highPassUniforms.smoothWidth.value=.01,this.materialHighPassFilter=new c({uniforms:this.highPassUniforms,vertexShader:o.vertexShader,fragmentShader:o.fragmentShader}),this.separableBlurMaterials=[];let s=[6,10,14,18,22];i=Math.round(this.resolution.x/2),a=Math.round(this.resolution.y/2);for(let e=0;e<this.nMips;e++)this.separableBlurMaterials.push(this._getSeparableBlurMaterial(s[e])),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/i,1/a),i=Math.round(i/2),a=Math.round(a/2);this.compositeMaterial=this._getCompositeMaterial(this.nMips),this.compositeMaterial.uniforms.blurTexture1.value=this.renderTargetsVertical[0].texture,this.compositeMaterial.uniforms.blurTexture2.value=this.renderTargetsVertical[1].texture,this.compositeMaterial.uniforms.blurTexture3.value=this.renderTargetsVertical[2].texture,this.compositeMaterial.uniforms.blurTexture4.value=this.renderTargetsVertical[3].texture,this.compositeMaterial.uniforms.blurTexture5.value=this.renderTargetsVertical[4].texture,this.compositeMaterial.uniforms.bloomStrength.value=t,this.compositeMaterial.uniforms.bloomRadius.value=.1;let l=[1,.8,.6,.4,.2];this.compositeMaterial.uniforms.bloomFactors.value=l,this.bloomTintColors=[new B(1,1,1),new B(1,1,1),new B(1,1,1),new B(1,1,1),new B(1,1,1)],this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,this.copyUniforms=y.clone(K.uniforms),this.blendMaterial=new c({uniforms:this.copyUniforms,vertexShader:K.vertexShader,fragmentShader:K.fragmentShader,premultipliedAlpha:!0,blending:2,depthTest:!1,depthWrite:!1,transparent:!0}),this._oldClearColor=new k,this._oldClearAlpha=1,this._basic=new L,this._fsQuad=new J(null)}dispose(){for(let e=0;e<this.renderTargetsHorizontal.length;e++)this.renderTargetsHorizontal[e].dispose();for(let e=0;e<this.renderTargetsVertical.length;e++)this.renderTargetsVertical[e].dispose();this.renderTargetBright.dispose();for(let e=0;e<this.separableBlurMaterials.length;e++)this.separableBlurMaterials[e].dispose();this.compositeMaterial.dispose(),this.blendMaterial.dispose(),this._basic.dispose(),this._fsQuad.dispose()}setSize(e,t){let n=Math.round(e/2),r=Math.round(t/2);this.renderTargetBright.setSize(n,r);for(let e=0;e<this.nMips;e++)this.renderTargetsHorizontal[e].setSize(n,r),this.renderTargetsVertical[e].setSize(n,r),this.separableBlurMaterials[e].uniforms.invSize.value=new E(1/n,1/r),n=Math.round(n/2),r=Math.round(r/2)}render(t,n,r,i,a){t.getClearColor(this._oldClearColor),this._oldClearAlpha=t.getClearAlpha();let o=t.autoClear;t.autoClear=!1,t.setClearColor(this.clearColor,0),a&&t.state.buffers.stencil.setTest(!1),this.renderToScreen&&(this._fsQuad.material=this._basic,this._basic.map=r.texture,t.setRenderTarget(null),t.clear(),this._fsQuad.render(t)),this.highPassUniforms.tDiffuse.value=r.texture,this.highPassUniforms.luminosityThreshold.value=this.threshold,this._fsQuad.material=this.materialHighPassFilter,t.setRenderTarget(this.renderTargetBright),t.clear(),this._fsQuad.render(t);let s=this.renderTargetBright;for(let n=0;n<this.nMips;n++)this._fsQuad.material=this.separableBlurMaterials[n],this.separableBlurMaterials[n].uniforms.colorTexture.value=s.texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionX,t.setRenderTarget(this.renderTargetsHorizontal[n]),t.clear(),this._fsQuad.render(t),this.separableBlurMaterials[n].uniforms.colorTexture.value=this.renderTargetsHorizontal[n].texture,this.separableBlurMaterials[n].uniforms.direction.value=e.BlurDirectionY,t.setRenderTarget(this.renderTargetsVertical[n]),t.clear(),this._fsQuad.render(t),s=this.renderTargetsVertical[n];this._fsQuad.material=this.compositeMaterial,this.compositeMaterial.uniforms.bloomStrength.value=this.strength,this.compositeMaterial.uniforms.bloomRadius.value=this.radius,this.compositeMaterial.uniforms.bloomTintColors.value=this.bloomTintColors,t.setRenderTarget(this.renderTargetsHorizontal[0]),t.clear(),this._fsQuad.render(t),this._fsQuad.material=this.blendMaterial,this.copyUniforms.tDiffuse.value=this.renderTargetsHorizontal[0].texture,a&&t.state.buffers.stencil.setTest(!0),this.renderToScreen?(t.setRenderTarget(null),this._fsQuad.render(t)):(t.setRenderTarget(r),this._fsQuad.render(t)),t.setClearColor(this._oldClearColor,this._oldClearAlpha),t.autoClear=o}_getSeparableBlurMaterial(e){let t=[],n=e/3;for(let r=0;r<e;r++)t.push(.39894*Math.exp(-.5*r*r/(n*n))/n);let r=[],i=[];for(let n=1;n<e;n+=2){let a=t[n],o=n+1<e?t[n+1]:0,s=a+o;r.push((n*a+(n+1)*o)/s),i.push(s)}return new c({defines:{KERNEL_PAIRS:r.length},uniforms:{colorTexture:{value:null},invSize:{value:new E(.5,.5)},direction:{value:new E(.5,.5)},centerWeight:{value:t[0]},gaussianOffsets:{value:r},gaussianWeights:{value:i}},vertexShader:`

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

				}`})}_getCompositeMaterial(e){return new c({defines:{NUM_MIPS:e},uniforms:{blurTexture1:{value:null},blurTexture2:{value:null},blurTexture3:{value:null},blurTexture4:{value:null},blurTexture5:{value:null},bloomStrength:{value:1},bloomFactors:{value:null},bloomTintColors:{value:null},bloomRadius:{value:0}},vertexShader:`

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

				}`})}};He.BlurDirectionX=new E(1,0),He.BlurDirectionY=new E(0,1);var Ue={name:`HorizontalTiltShiftShader`,uniforms:{tDiffuse:{value:null},h:{value:1/512},r:{value:.35}},vertexShader:`

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

		}`},We={name:`VerticalTiltShiftShader`,uniforms:{tDiffuse:{value:null},v:{value:1/512},r:{value:.35}},vertexShader:`

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

		}`};function Ge(e,t){try{let e=new URLSearchParams(window.location.search).get(`quest3dq`);if(e===`high`||e===`low`)return e}catch{}if(t)return`low`;try{let t=e.getContext(),n=t.getExtension(`WEBGL_debug_renderer_info`),r=String(n?t.getParameter(n.UNMASKED_RENDERER_WEBGL):t.getParameter(t.RENDERER));if(/swiftshader|llvmpipe|software|basic render/i.test(r))return`low`}catch{}return`high`}function Ke(e,t){let n=new ce;n.scale.setScalar(100);let r=n.material.uniforms;r.turbidity.value=5,r.rayleigh.value=1.8,r.mieCoefficient.value=.006,r.mieDirectionalG.value=.82,r.sunPosition.value.copy(t);let i=new m;i.add(n);let a=new z(e),o=a.fromScene(i,.04);return a.dispose(),n.geometry.dispose(),n.material.dispose(),o}var qe={name:`QuestGradeShader`,uniforms:{tDiffuse:{value:null},uSaturation:{value:1.12},uWarmth:{value:.035},uVignette:{value:.28}},vertexShader:`
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
  `},Je=class{renderer;scene;camera;quality;onQuality;composer=null;tiltH=null;tiltV=null;slowTime=0;size=new E(1,1);constructor(e,t,n,r,i=()=>void 0){this.renderer=e,this.scene=t,this.camera=n,this.quality=r,this.onQuality=i,r===`high`&&this.buildComposer()}get level(){return this.quality}buildComposer(){let{x:e,y:t}=this.size,n=new I(e,t,{type:A,samples:4}),r=new De(this.renderer,n);r.addPass(new Be(this.scene,this.camera));let i=new Le(this.scene,this.camera,e,t);i.blendIntensity=.85,i.updateGtaoMaterial({radius:.55,distanceExponent:1.4,thickness:1.2,scale:1,samples:12}),r.addPass(i),r.addPass(new He(new E(e,t),.18,.4,1.6)),this.tiltH=new Y(Ue),this.tiltV=new Y(We),r.addPass(this.tiltH),r.addPass(this.tiltV),r.addPass(new ze),r.addPass(new Y(qe)),this.composer=r,this.setSize(e,t)}setSize(e,t){this.size.set(e,t),this.composer&&(this.composer.setPixelRatio(this.renderer.getPixelRatio()),this.composer.setSize(e,t),this.tiltH&&(this.tiltH.uniforms.h.value=3/e,this.tiltH.uniforms.r.value=.52),this.tiltV&&(this.tiltV.uniforms.v.value=3/t,this.tiltV.uniforms.r.value=.52))}render(e=0){this.composer?(this.composer.render(e),e>.045?this.slowTime+=e:this.slowTime=Math.max(0,this.slowTime-e*2),this.slowTime>3&&this.lower()):this.renderer.render(this.scene,this.camera)}lower(){this.quality!==`low`&&(this.quality=`low`,this.dropComposer(),this.onQuality(`low`))}dropComposer(){let e=this.composer;if(e){for(let t of e.passes)t.dispose();e.dispose(),this.composer=null,this.tiltH=null,this.tiltV=null}}dispose(){this.dropComposer()}},Z=(e,t,n=0)=>{let r=Math.imul(e*374761393+t*668265263+n*2147483647,1274126177);return r=Math.imul(r^r>>>13,1103515245),((r^r>>>16)>>>0)/4294967295},Ye=e=>e*e*(3-2*e);function Xe(e,t,n=0){let r=Math.floor(e),i=Math.floor(t),a=Ye(e-r),o=Ye(t-i),s=Z(r,i,n),c=Z(r+1,i,n),l=Z(r,i+1,n),u=Z(r+1,i+1,n);return(s+(c-s)*a)*(1-o)+(l+(u-l)*a)*o}var Ze=(e,t,n=0)=>Xe(e,t,n)*.6+Xe(e*2.1,t*2.1,n+1)*.3+Xe(e*4.3,t*4.3,n+2)*.1,Qe={grass:0,road:-.04,sand:-.06,mud:-.12,"bank-west":-.45,"bank-east":-.45,water:-.9},$e=new Set([`road`,`sand`,`mud`]),et={grass:new k(`#5f9638`),road:new k(`#b27a48`),sand:new k(`#dcc390`),mud:new k(`#5d4029`),"bank-west":new k(`#5e6a35`),"bank-east":new k(`#5e6a35`),water:new k(`#4a6b45`)},tt=new k(`#4d872c`),nt=new k(`#8fa648`),rt=class{scene;constructor(e){this.scene=e}kind(e,t){let{width:n,height:r,ground:i}=this.scene,a=Math.min(n-1,Math.max(0,e));return i[Math.min(r-1,Math.max(0,t))*n+a]??`grass`}around(e,t){let n=e-.5,r=t-.5,i=Math.floor(n),a=Math.floor(r),o=Ye(Math.min(1,Math.max(0,n-i))),s=Ye(Math.min(1,Math.max(0,r-a)));return[{kind:this.kind(i,a),weight:(1-o)*(1-s)},{kind:this.kind(i+1,a),weight:o*(1-s)},{kind:this.kind(i,a+1),weight:(1-o)*s},{kind:this.kind(i+1,a+1),weight:o*s}]}pathWeight(e,t){return this.around(e,t).reduce((e,t)=>e+($e.has(t.kind)?t.weight:0),0)}heightAt(e,t){let n=this.around(e,t).reduce((e,t)=>e+Qe[t.kind]*t.weight,0),r=Math.min(1,Math.max(0,(n+.25)/.25)),i=1-Math.min(1,this.pathWeight(e,t)*1.6);return n+(Ze(e*.32,t*.32,7)-.5)*.24*r*i}colourAt(e,t,n){let r=this.around(e,t),i=Ze(e*.22,t*.22,3),a=tt.clone().lerp(nt,Ye(Math.min(1,Math.max(0,i*1.6-.45))));a.lerp(et.grass,.35),n.setRGB(0,0,0);for(let e of r){let t=e.kind===`grass`?a:et[e.kind];n.r+=t.r*e.weight,n.g+=t.g*e.weight,n.b+=t.b*e.weight}let o=r.filter(e=>$e.has(e.kind)).sort((e,t)=>t.weight-e.weight)[0];if(o){let e=r.filter(e=>e.kind===o.kind).reduce((e,t)=>e+t.weight,0),t=Ye(Math.min(1,Math.max(0,(e-.32)/.22)));n.lerp(et[o.kind],t)}let s=.94+Xe(e*3.7,t*3.7,11)*.12;return n.multiplyScalar(s)}};function it(e,t,n){let r=n===`high`?4:2,i=new H(t.width+24,t.height+24,(t.width+24)*r,(t.height+24)*r);i.rotateX(-Math.PI/2),i.translate(t.width/2,0,t.height/2);let a=i.attributes.position,o=new Float32Array(a.count*3),s=new k;for(let t=0;t<a.count;t+=1){let n=a.getX(t),r=a.getZ(t);a.setY(t,e.heightAt(n,r)),e.colourAt(n,r,s),o.set([s.r,s.g,s.b],t*3)}i.setAttribute(`color`,new M(o,3)),i.computeVertexNormals();let c=new F(i,new R({vertexColors:!0,roughness:.95,metalness:0}));return c.receiveShadow=!0,c}function at(e,t,n,r,i){let o=[],s=[],c=new k(r),l=new k(i);for(let r=0;r<e;r+=1){let i=r/e*Math.PI+Z(r,e)*.6,a=.25+Z(r,7)*.35,u=t*(.7+Z(r,3)*.5),d=Math.cos(i)*n,f=Math.sin(i)*n,p=Math.cos(i+Math.PI/2)*a*u*.5,m=Math.sin(i+Math.PI/2)*a*u*.5;o.push(-d,0,-f,d,0,f,p,u,m),s.push(c.r,c.g,c.b,c.r,c.g,c.b,l.r,l.g,l.b)}let u=new ae;return u.setAttribute(`position`,new a(o,3)),u.setAttribute(`color`,new a(s,3)),u.computeVertexNormals(),u}function ot(e,t){let n=new R({vertexColors:!0,side:2,roughness:.85,metalness:0});return n.onBeforeCompile=n=>{n.uniforms.uTime=e,n.vertexShader=n.vertexShader.replace(`#include <common>`,`#include <common>
uniform float uTime;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 rootWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #else
          vec4 rootWorld = vec4(0.0);
        #endif
        float gust = sin(uTime * 1.7 + rootWorld.x * 0.55 + rootWorld.z * 0.35)
          + 0.4 * sin(uTime * 3.3 + rootWorld.x * 1.7);
        transformed.x += gust * ${t.toFixed(3)} * position.y;
        transformed.z += gust * ${(t*.4).toFixed(3)} * position.y;`)},n}function st(e,t,n,r){let a=new l(e,t,Math.max(1,n.length)),o=new V,s=new i,c=new B(0,1,0);return n.forEach((e,t)=>{s.setFromAxisAngle(c,e.turn),o.compose(new B(e.x,r(e.x,e.z),e.z),s,new B(e.scale,e.scale,e.scale)),a.setMatrixAt(t,o)}),a.count=n.length,a.receiveShadow=!0,a.castShadow=!1,a}function ct(e,t){let n=[];for(let{x:r,y:i}of e){let e=-1/0;for(let n=0;n<=4;n+=1)for(let a=0;a<=4;a+=1)e=Math.max(e,t(r+n/4,i+a/4));let a=e+.02;n.push(r,a,i,r,a,i+1,r+1,a,i,r+1,a,i,r,a,i+1,r+1,a,i+1)}let r=new ae;r.setAttribute(`position`,new a(n,3)),r.computeVertexNormals();let i=new F(r,new R({color:`#4f7468`,roughness:.06,metalness:.05,transparent:!0,opacity:.62}));return i.receiveShadow=!0,i}function lt(e,t){let n=new rt(e),r=(e,t)=>n.heightAt(e,t),i={value:0},a=[],o=[],s=e=>(o.push(e),e),c=it(n,e,t.quality);s(c.geometry),s(c.material),a.push(c);let l=t.quality===`high`?6:2,u=[];for(let r=0;r<e.height;r+=1)for(let i=0;i<e.width;i+=1)if(!(n.kind(i,r)!==`grass`||t.occupied.has(`${i},${r}`)))for(let e=0;e<l;e+=1){let t=i+Z(i,r,e*2+31),a=r+Z(i,r,e*2+32);n.pathWeight(t,a)>.25||n.heightAt(t,a)<-.12||u.push({x:t,z:a,scale:.7+Z(i,r,e+50)*.7,turn:Z(i,r,e+60)*6.28})}u.sort((e,t)=>Z(Math.floor(e.x*97),Math.floor(e.z*89),5)-Z(Math.floor(t.x*97),Math.floor(t.z*89),5));let d=st(s(at(5,.26,.03,`#3d7a26`,`#a7d060`)),s(ot(i,.22)),u,r);a.push(d);let f=e.props.filter(e=>e.kind===`rice`);if(f.length>0){let e=[];for(let t of f)for(let n=0;n<3;n+=1)for(let r=0;r<3;r+=1)e.push({x:t.x+.18+r*.32+(Z(t.x,t.y,n*3+r)-.5)*.06,z:t.y+.18+n*.32+(Z(t.y,t.x,n*3+r)-.5)*.06,scale:.85+Z(t.x,n,r)*.3,turn:Z(r,n,t.x)*6.28});let t=st(s(at(7,.42,.02,`#4c8a2c`,`#b8d86a`)),s(ot(i,.16)),e,r);a.push(t);let n=ct(f,r);s(n.geometry),s(n.material),a.push(n)}return{objects:a,heightAt:r,update(e){i.value=e},lower(){d.count=Math.ceil(u.length/3)},dispose(){for(let e of o)e.dispose()}}}var ut=.16,dt=3,ft=-.22,pt=new B(-16,8,4).normalize(),mt={ArrowLeft:{x:-1,y:0},KeyA:{x:-1,y:0},ArrowRight:{x:1,y:0},KeyD:{x:1,y:0},ArrowUp:{x:0,y:-1},KeyW:{x:0,y:-1},ArrowDown:{x:0,y:1},KeyS:{x:0,y:1}},Q=(e,t,n=0)=>{let r=Math.imul(e*374761393+t*668265263+n*2147483647,1274126177);return r=Math.imul(r^r>>>13,1103515245),((r^r>>>16)>>>0)/4294967295},ht=(e,t)=>e.x===t.x&&e.y===t.y,gt=e=>new B(e.x+.5,0,e.y+.5);function _t(e,t){return Math.max(e.x-t.x,0,t.x-(e.x+e.w-1))+Math.max(e.y-t.y,0,t.y-(e.y+e.h-1))}var $=[`#c68e62`,`#a8714a`,`#8d5b3b`],vt={hero:{skin:$[0],shirt:`#2ecc71`,lower:`#2f3b4c`,hair:`#1c1814`},boatman:{skin:$[2],shirt:`#efe6d2`,lower:`#3b7f86`,hair:`#dcd6cc`,hat:`#d8b264`,beard:`#e8e2d8`},seller:{skin:$[1],shirt:`#d9622b`,lower:`#efe6d2`,hair:`#1c1814`},fisher:{skin:$[2],shirt:`#5f9e48`,lower:`#3b5f86`,hair:`#1c1814`,hat:`#2d8a7a`},farmer:{skin:$[2],shirt:`#f1ece2`,lower:`#7d5a9e`,hair:`#1c1814`,hat:`#d8b264`},villager:{skin:$[0],shirt:`#e0742e`,lower:`#b8392b`,hair:`#1c1814`,long:!0}},yt=class{materials=new Map;disposables=[];mat(e,t={}){let n=`${e}|${t.emissive??``}|${t.rough??.9}`,r=this.materials.get(n);return r||(r=new R({color:e,roughness:t.rough??.9,metalness:0,flatShading:!0,...t.emissive?{emissive:t.emissive,emissiveIntensity:.9}:{}}),this.materials.set(n,r),this.disposables.push(r)),r}keep(e){return this.disposables.push(e),e}mesh(e,t,n=!0){this.keep(e);let r=new F(e,t);return r.castShadow=n,r.receiveShadow=!0,r}};function bt(e,n,r){let i=new t,a=e.mat(`#5a8f38`,{rough:1}),o=e.mesh(new H(40,n.height+80),a,!1);o.rotation.x=-Math.PI/2,o.position.set(-32,-.03,n.height/2);let s=e.mesh(new H(40,n.height+80),a,!1);s.rotation.x=-Math.PI/2,s.position.set(n.width+12+20,-.03,n.height/2);for(let[t,o]of[[-12,r.west],[r.east,n.width+12]])for(let r of[-32,n.height+12+20]){let n=e.mesh(new H(o-t,40),a,!1);n.rotation.x=-Math.PI/2,n.position.set((t+o)/2,-.03,r),i.add(n)}let c=e.mesh(new H(r.east-r.west+2,n.height+80),e.mat(`#4f7a52`),!1);return c.rotation.x=-Math.PI/2,c.position.set((r.west+r.east)/2,-.92,n.height/2),i.add(o,s,c),i}function xt(e,t,n){let r=e.keep(new c({transparent:!0,fog:!0,uniforms:y.merge([re.fog,{uTime:{value:0},uDeep:{value:new k(`#2d7f8c`)},uShallow:{value:new k(`#3f9f98`)},uFoam:{value:new k(`#f4f1e4`)},uBanks:{value:new E(n.west+.55,n.east-.55)}}]),vertexShader:`
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
      `})),i=new H(n.east-n.west,t.height+80,28,80),a=e.mesh(i,r,!1);return a.rotation.x=-Math.PI/2,a.position.set((n.west+n.east)/2,ft,t.height/2),a.receiveShadow=!1,{water:a,material:r}}function St(e,n,r,i=`#c7a45a`){let a=new t,o=e.mesh(new U(r,r*1.05,n,7),e.mat(i));a.add(o);for(let t of[-.3,.2]){let i=e.mesh(new U(r*1.25,r*1.25,Math.min(.05,n*.05),7),e.mat(`#9c7c3c`));i.position.y=t*n,a.add(i)}return a}function Ct(e,n){let r=new t,i=Q(n.x,n.y),a=.85+i*.35;if(n.kind===`tree`&&Q(n.x,n.y,9)<.34){let n=e.mesh(new U(.08,.12,1.1,6),e.mat(`#8a9a4a`));n.position.y=.55,r.add(n);for(let n=0;n<6;n+=1){let a=new t,o=e.mesh(new w(.26,.02,.85),e.mat(n%2?`#4f9a30`:`#62ad3a`));o.position.z=.42,a.add(o);let s=n/6*Math.PI*2+i;a.position.y=1.08+n%3*.08,a.rotation.set(-.35+n%2*.25,s,0,`YXZ`),r.add(a)}}else if(n.kind===`pine`){let t=e.mesh(new U(.05,.08,2.4,6),e.mat(`#8b7355`));t.position.y=1.2,r.add(t);for(let t=0;t<7;t+=1){let n=e.mesh(new w(.12,.02,.75),e.mat(`#4f8a31`)),i=t/7*Math.PI*2;n.position.set(Math.sin(i)*.3,2.35,Math.cos(i)*.3),n.rotation.set(.7,i,0),r.add(n)}}else{let t=n.kind===`krishnachura`,a=e.mesh(new U(.09,.14,t?.9:.8,6),e.mat(`#6e4b2e`));a.position.y=t?.45:.4,r.add(a);let o=n.variant===1?[`#2f7d5b`,`#357f5e`]:[`#4f8f32`,`#5a9c38`,`#467f2c`],s=t?[`#e2552d`,`#d8462a`,`#ef6a35`]:o,c=t?4:3;for(let n=0;n<c;n+=1){let a=t?.42:.48-n*.06,o=e.mesh(new f(a,0),e.mat(s[n%s.length]??`#4f8f32`)),l=n/c*Math.PI*2+i*3,u=t?.38:.2;o.position.set(Math.sin(l)*u,(t?1.05:1)+n*(t?.02:.2),Math.cos(l)*u),t&&o.scale.set(1.2,.55,1.2),r.add(o)}if(n.kind===`fruit-tree`)for(let t=0;t<6;t+=1){let n=e.mesh(new _(.06,6,4),e.mat(`#f0a32e`),!1),i=t/6*Math.PI*2;n.position.set(Math.sin(i)*.42,.95+t%2*.25,Math.cos(i)*.42),r.add(n)}}return r.scale.setScalar(a),r.rotation.y=i*Math.PI*2,r}function wt(e,n,r){let i=new t,a=n.kind===`kash`,o=a?7:6;for(let s=0;s<o;s+=1){let c=new t,l=(a?.75:.55)+Q(n.x,n.y,s)*.3,u=e.mesh(new b(.03,l,4),e.mat(a?`#9fb36a`:`#5e8f3a`),!1);if(u.position.y=l/2,c.add(u),a){let t=e.mesh(new _(.07,5,4),e.mat(`#f6f3ea`),!1);t.scale.set(.7,1.9,.7),t.position.y=l+.08,c.add(t)}let d=s/o*Math.PI*2;c.position.set(Math.sin(d)*.18,0,Math.cos(d)*.18),c.rotation.z=(Q(n.x,s)-.5)*.3,c.userData.phase=Q(n.x,n.y,s+20)*Math.PI*2,r.push(c),i.add(c)}return i}function Tt(e){let n=new t,r=e.mesh(new w(1.7,1.05,2.2),e.mat(`#c9955e`));r.position.y=.52,n.add(r);let i=e.mesh(new w(1.9,.12,2.4),e.mat(`#a87a4a`));i.position.y=.06,n.add(i);let a=e.mesh(new b(1.55,1,4,1),e.mat(`#c9a050`));a.rotation.y=Math.PI/4,a.scale.set(1,1,1.55),a.position.y=1.5,n.add(a);let o=e.mesh(new w(.45,.72,.06),e.mat(`#5b3a22`),!1);o.position.set(.25,.4,1.11),n.add(o);let s=e.mesh(new w(.3,.25,.06),e.mat(`#3b2a1a`),!1);return s.position.set(-.45,.6,1.11),n.add(s),n}function Et(e){let n=new t;for(let[t,r]of[[-.85,-.4],[.85,-.4],[-.85,.45],[.85,.45]]){let i=e.mesh(new U(.04,.04,1.3,5),e.mat(`#7a5232`));i.position.set(t,.65,r),n.add(i)}let r=e.mesh(new w(1.8,.5,.6),e.mat(`#9a6a3e`));r.position.set(0,.25,.3),n.add(r);let i=document.createElement(`canvas`);i.width=64,i.height=8;let a=i.getContext(`2d`);if(a)for(let e=0;e<8;e+=1)a.fillStyle=e%2?`#f2e8d2`:`#d9622b`,a.fillRect(e*8,0,8,8);let o=e.keep(new T(i));o.colorSpace=d;let s=e.keep(new R({map:o,roughness:.9,side:2})),c=e.mesh(new H(2,1.1),s);c.rotation.x=-Math.PI/2+.35,c.position.set(0,1.32,.05),n.add(c);for(let[t,r]of[`#f2c230`,`#8bc34a`,`#e8732c`,`#f2c230`].entries()){let i=e.mesh(new _(.16,6,4),e.mat(r),!1);i.scale.y=.6,i.position.set(-.6+t*.4,.55,.3),n.add(i)}return n}function Dt(e,n){let r=new t,i=new w(.62,.28,2,1,1,10),a=i.attributes.position;for(let e=0;e<a.count;e+=1){let t=a.getZ(e),n=Math.abs(t)/1;a.setX(e,a.getX(e)*(1-n*n*.92)),a.getY(e)>0?a.setY(e,a.getY(e)+n*n*.28):a.setY(e,a.getY(e)*(1-n*.5))}i.computeVertexNormals();let o=e.mesh(i,e.mat(`#6e4326`));r.add(o);let s=e.mesh(new w(.42,.05,1.3),e.mat(`#8a5a33`),!1);if(s.position.y=.1,r.add(s),n){let n=e.mesh(new U(.34,.34,.8,8,1,!0,0,Math.PI),e.mat(`#b68e4c`));n.rotation.set(Math.PI/2,0,Math.PI/2),n.rotation.order=`YXZ`,n.rotation.set(0,0,0),n.rotation.x=Math.PI/2,n.rotation.y=Math.PI/2,n.position.y=.16,n.scale.set(1,1,1);let i=new t;i.add(n),i.rotation.y=Math.PI/2,r.add(i)}return r}function Ot(e,n){let r=new t,i=[];for(let a of[-1,1]){let o=new t,s=e.mesh(new w(.11,.36,.12),e.mat(n.lower));s.position.y=-.18,o.add(s),o.position.set(a*.08,.38,0),i.push(o),r.add(o)}let a=e.mesh(new U(.15,.19,.42,7),e.mat(n.shirt));if(a.position.y=.58,r.add(a),n.long){let t=e.mesh(new U(.19,.24,.42,7),e.mat(n.lower));t.position.y=.3,r.add(t)}let o=[];for(let i of[-1,1]){let a=new t,s=e.mesh(new w(.08,.34,.09),e.mat(n.skin));s.position.y=-.17,a.add(s),a.position.set(i*.21,.76,0),a.rotation.z=i*.12,o.push(a),r.add(a)}let s=e.mesh(new _(.14,8,6),e.mat(n.skin));s.position.y=.95,r.add(s);let c=e.mesh(new _(.15,8,4,0,Math.PI*2,0,Math.PI/2),e.mat(n.hair));if(c.position.y=.97,c.rotation.x=-.25,r.add(c),n.long){let t=e.mesh(new w(.07,.4,.07),e.mat(n.hair));t.position.set(0,.72,-.15),r.add(t)}if(n.beard){let t=e.mesh(new w(.16,.12,.08),e.mat(n.beard));t.position.set(0,.86,.1),r.add(t)}if(n.hat){let t=e.mesh(new b(.34,.16,10),e.mat(n.hat));t.position.y=1.12,r.add(t)}for(let t of[-1,1]){let n=e.mesh(new w(.025,.03,.02),e.mat(`#1a1410`),!1);n.position.set(t*.05,.97,.135),r.add(n)}return{group:r,legs:i,arms:o}}var kt=class{options;kit=new yt;renderer;scene=new m;camera=new O(34,1,.1,200);sun;ground;finish;skyTarget;clock=new P;calm;coarse;description;waterMaterial;hero;heroShadow;idlers=[];floaters=[];sway=[];spans=new Map;barriers;marks=new Map;hover;tapRing;growing=[];state;grid;cell;route=[];intent=null;stepFrom=null;stepTo=null;stepT=0;walkPhase=0;presses=[];held=new Set;paused=!1;destroyed=!1;tapT=1;framed=!1;cameraTarget=new B;resize;cleanups=[];constructor(e){this.options=e,this.state=e.state,this.grid=pe(e.map,e.state.completed);let n=e.start;this.cell=n&&me(this.grid,n)?n:e.map.spawn,this.calm=typeof window.matchMedia==`function`&&window.matchMedia(`(prefers-reduced-motion: reduce)`).matches,this.coarse=typeof window.matchMedia==`function`&&window.matchMedia(`(pointer: coarse)`).matches,this.renderer=new ie({antialias:!0,powerPreference:`high-performance`});let i=[];try{this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,this.coarse?1.5:2)),this.renderer.outputColorSpace=d,this.renderer.toneMapping=4,this.renderer.toneMappingExposure=1.08,this.renderer.shadowMap.enabled=!0,this.renderer.shadowMap.type=2,this.renderer.domElement.style.display=`block`,this.renderer.domElement.style.touchAction=`none`,this.renderer.domElement.dataset.questRenderer=`3d`,e.parent.append(this.renderer.domElement),i.push(()=>this.renderer.domElement.remove());let n=new k(`#f3d8ac`);this.scene.background=n,this.scene.fog=new p(n,20,52);let a=Ge(this.renderer,this.coarse),o=Ke(this.renderer,pt);this.skyTarget=o,i.push(()=>o.dispose()),this.scene.environment=o.texture,this.scene.environmentIntensity=.14,this.scene.add(new u(`#dfe9ff`,`#5a7a3a`,.55)),this.sun=new r(`#ffd49a`,2.7),this.sun.castShadow=!0;let s=a===`high`?2048:1024;this.sun.shadow.mapSize.set(s,s),Object.assign(this.sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16,near:1,far:60}),this.sun.shadow.bias=-6e-4,this.sun.shadow.normalBias=.02,this.scene.add(this.sun,this.sun.target),this.description=Ce(e.mapJson);let c=this.riverBanks(),l=lt(this.description,{quality:a,occupied:this.occupiedSquares()});this.ground=l,i.push(()=>l.dispose()),this.scene.add(...this.ground.objects),this.scene.add(bt(this.kit,this.description,c));let{water:f,material:m}=xt(this.kit,this.description,c);this.waterMaterial=m,this.scene.add(f),this.barriers=new t,this.scene.add(this.barriers),this.buildProps(),this.buildBridge(),this.buildPeople(),this.hero=Ot(this.kit,vt.hero);let h=this.onGround(gt(this.cell));this.hero.group.position.copy(h),this.scene.add(this.hero.group),this.heroShadow=this.kit.mesh(new j(0,.24,16),this.kit.keep(new L({color:`#000000`,transparent:!0,opacity:.22,depthWrite:!1})),!1),this.heroShadow.rotation.x=-Math.PI/2,this.scene.add(this.heroShadow),this.hover=this.kit.mesh(new j(.36,.46,4,1,Math.PI/4),this.kit.keep(new L({color:`#ffffff`,transparent:!0,opacity:.75,depthWrite:!1})),!1),this.hover.rotation.x=-Math.PI/2,this.hover.visible=!1,this.scene.add(this.hover),this.tapRing=this.kit.mesh(new j(.3,.38,24),this.kit.keep(new L({color:`#ffffff`,transparent:!0,opacity:0,depthWrite:!1})),!1),this.tapRing.rotation.x=-Math.PI/2,this.scene.add(this.tapRing);let g=new Je(this.renderer,this.scene,this.camera,a,()=>{this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)),this.sun.shadow.mapSize.set(1024,1024),this.sun.shadow.map?.dispose(),this.sun.shadow.map=null,this.ground.lower(),this.fit()});this.finish=g,i.push(()=>g.dispose()),this.cameraTarget.copy(this.clampTarget(h)),this.showState(!1),this.listen();let _=new ResizeObserver(()=>this.fit());this.resize=_,i.push(()=>_.disconnect()),_.observe(e.parent),this.fit()}catch(e){for(let e of i.reverse())e();for(let e of this.cleanups)e();for(let e of this.kit.disposables)e.dispose();throw this.renderer.dispose(),e}this.renderer.setAnimationLoop(()=>this.frame()),this.options.onEvent({kind:`ready`})}setState(e){this.state=e,this.grid=pe(this.options.map,e.completed),this.showState(!0)}setPaused(e){this.paused!==e&&(this.paused=e,this.route=[],this.intent=null,this.presses=[],this.held.clear(),this.hover.visible=!1,e?(this.renderer.setAnimationLoop(null),this.finish.render()):(this.clock.getDelta(),this.renderer.setAnimationLoop(()=>this.frame())))}destroy(){if(!this.destroyed){this.destroyed=!0,this.renderer.setAnimationLoop(null),this.resize.disconnect();for(let e of this.cleanups)e();for(let e of this.kit.disposables)e.dispose();this.ground.dispose(),this.finish.dispose(),this.skyTarget.dispose(),this.renderer.dispose(),this.renderer.domElement.remove()}}riverBanks(){let{width:e,height:t,ground:n}=this.description,r=e,i=0;for(let a=0;a<t;a+=1)for(let t=0;t<e;t+=1){let o=n[a*e+t];(o===`water`||o===`bank-west`||o===`bank-east`)&&(r=Math.min(r,t),i=Math.max(i,t+1))}return r<i?{west:r,east:i}:{west:0,east:0}}place(e,t,n=0,r=.12,i=!0){let a=t.x+.5+(Q(t.x,t.y,5)-.5)*r,o=t.y+.5+(Q(t.x,t.y,6)-.5)*r;e.position.set(a,i?this.ground.heightAt(a,o)+n:n,o),this.scene.add(e)}onGround(e){return e.setY(this.ground.heightAt(e.x,e.z))}occupiedSquares(){let e=new Set,t=(t,n)=>e.add(`${t},${n}`);for(let e of this.description.props)if(e.kind!==`rice`&&e.kind!==`flowers`){if(t(e.x,e.y),e.kind===`hut`)for(let n=-3;n<=0;n+=1)for(let r of[-1,0])t(e.x+r,e.y+n);if(e.kind===`stall`)for(let[n,r]of[[1,0],[0,1],[1,1]])t(e.x+n,e.y+r)}return e}buildProps(){let e=this.kit;for(let n of this.description.props)switch(n.kind){case`tree`:case`krishnachura`:case`pine`:case`fruit-tree`:this.place(Ct(e,n),n,0,.3);break;case`bush`:{let t=e.mesh(new f(.38,0),e.mat([`#4f8a31`,`#3f7a2a`,`#5a9a3a`][n.variant]??`#4f8a31`));t.scale.set(1.2,.75,1.1),this.place(t,n,.22);break}case`rock`:case`river-rock`:{let t=e.mesh(new oe(.3,0),e.mat(n.variant===0?`#9a948a`:`#8a8378`));t.scale.set(1.2,.6,1),t.rotation.y=Q(n.x,n.y)*6,n.kind===`river-rock`?this.place(t,n,-.16999999999999998,.3,!1):this.place(t,n,.1,.3);break}case`reeds`:case`kash`:this.place(wt(e,n,this.sway),n,n.x>0?-.05:0,.4);break;case`flowers`:{let r=new t,i=[`#e8452a`,`#9a55d0`,`#fff4d6`][n.variant]??`#e8452a`,a=e.mesh(new f(.2,0),e.mat(`#4f9a30`));a.scale.set(1.4,.5,1.4),a.position.y=.06,r.add(a);for(let t=0;t<6;t+=1){let a=t/6*Math.PI*2+Q(n.x,n.y)*3,o=.08+Q(n.x,t)*.16,s=e.mesh(new U(.01,.01,.22,3),e.mat(`#3f7f28`),!1);s.position.set(Math.sin(a)*o,.13,Math.cos(a)*o);let c=e.mesh(new f(.055,0),e.mat(i,{rough:.7}),!1);c.position.set(Math.sin(a)*o,.26,Math.cos(a)*o),r.add(s,c)}this.place(r,n);break}case`rice`:break;case`hut`:{let t=Tt(e);t.position.set(n.x,this.ground.heightAt(n.x,n.y-.6)-.04,n.y-.6),this.scene.add(t);break}case`stall`:{let t=Et(e);t.position.set(n.x+1,this.ground.heightAt(n.x+1,n.y+1),n.y+1),this.scene.add(t);break}case`sacks`:{let t=e.mesh(new _(.22,7,5),e.mat(`#e0d2ae`));t.scale.set(1,1.15,.9),this.place(t,n,.22);break}case`basket`:{let t=e.mesh(new U(.24,.18,.22,8),e.mat(`#b08542`));this.place(t,n,.11);break}case`barrel`:{let t=e.mesh(new U(.2,.2,.45,9),e.mat(`#7a5232`));this.place(t,n,.22);break}case`lantern`:{let r=new t,i=e.mesh(new U(.035,.045,1.2,5),e.mat(`#5b3a22`));i.position.y=.6;let a=e.mesh(new w(.16,.2,.16),e.mat(`#ffd27a`,{emissive:`#ffb347`}));a.position.y=1.25,r.add(i,a),this.place(r,n,0,0);break}case`signpost`:{let r=new t,i=e.mesh(new U(.04,.05,1,5),e.mat(`#6e4b2e`));i.position.y=.5;let a=e.mesh(new w(.6,.22,.05),e.mat(`#a5784a`));a.position.set(.12,.85,0),r.add(i,a),this.place(r,n,0,0);break}case`pile`:{let r=St(e,1.4,.07);r.position.y=.7;let i=new t;i.add(r);let a=n.variant===0?.4:-.4;i.position.set(n.x+.5,-.65,n.y+.5+a),this.scene.add(i);break}case`jetty`:{let t=e.mesh(new w(1,.08,1),e.mat(n.variant?`#8a5f38`:`#94673d`));if(this.place(t,n,.02,0,!1),(n.x+n.y)%2==0){let t=St(e,1,.06,`#7a5232`);t.position.set(n.x+.1,-.45,n.y+.1),this.scene.add(t)}break}case`fence`:{let r=new t,i=e.mesh(new w(.1,.7,.1),e.mat(`#7a5232`));i.position.set(-.45,.35,0),r.add(i);for(let t of[.28,.55]){let n=e.mesh(new w(1,.06,.06),e.mat(`#8a6040`));n.position.y=t,r.add(n)}this.place(r,n,0,0);break}case`boat`:{let t=Dt(e,n.variant===0);t.rotation.y=Q(n.x,n.y)*.4-.2,this.place(t,n,-.16999999999999998,.2,!1),this.floaters.push({group:t,base:t.position.y,phase:Q(n.x,n.y,7)*6});break}}}buildBridge(){let e=this.kit;for(let n of this.options.map.gates){let r=this.description.deck.filter(e=>le(n,e));if(r.length===0)continue;let i=new t,a=[...new Set(r.map(e=>e.x))],o=r.map(e=>e.y),s=Math.min(...o),c=Math.max(...o)+1,l=c-s+.4;for(let t of a)for(let n=0;n<6;n+=1){let r=St(e,l,.075,n%2?`#c9a65c`:`#bf9a50`);r.rotation.x=Math.PI/2,r.position.set(t+.09+n*.165,.1,(s+c)/2),i.add(r)}let u=Math.min(...a),d=Math.max(...a)+1;for(let t of[s-.12,c+.12]){let n=St(e,d-u,.05);n.rotation.z=Math.PI/2,n.position.set((u+d)/2,.72,t),i.add(n);for(let n=u;n<=d;n+=1){let r=St(e,.75,.045,`#a8874a`);r.position.set(n,.42,t),i.add(r)}}i.visible=!1,this.scene.add(i),this.spans.set(`${n.quest}@${n.x},${n.y}`,i)}for(let n of this.description.barriers){let r=new t;for(let t of[.25,.5,.75]){let n=e.mesh(new w(1,.08,.08),e.mat(`#8a5a33`));n.position.y=t,r.add(n)}for(let t of[-.45,.45]){let n=e.mesh(new w(.12,1,.12),e.mat(`#6e4326`));n.position.set(t,.5,0),r.add(n)}r.position.set(n.x+.5,0,n.y+.5),r.userData.cell=n,this.barriers.add(r)}}buildPeople(){let e=Ot(this.kit,vt.boatman);e.group.position.copy(this.onGround(gt(this.options.map.giver))),e.group.rotation.y=Math.PI*.75,this.scene.add(e.group),this.idlers.push({group:e.group,base:e.group.position.y,phase:.4});for(let e of this.options.map.scenery){if(e.kind!==`figure`)continue;let t=vt[e.look];if(!t)continue;let n=Ot(this.kit,t);n.group.position.copy(this.onGround(gt(e.at))),n.group.rotation.y=Q(e.at.x,e.at.y)*Math.PI*2,this.scene.add(n.group),this.idlers.push({group:n.group,base:n.group.position.y,phase:Q(e.at.x,e.at.y,2)*6})}}showState(e){let t=de(this.options.map,this.state.completed),n=e=>t.some(t=>`${t.quest}@${t.x},${t.y}`===e);for(let[t,r]of this.spans){let i=!n(t);i&&!r.visible?(r.visible=!0,e&&!this.calm&&(r.position.y=-.8,this.growing.push({group:r,t:0}))):i||(r.visible=!1)}for(let e of this.barriers.children){let n=e.userData.cell;e.visible=t.some(e=>le(e,n))}let r=new Map;this.state.open.size>0&&r.set(`giver`,gt(this.options.map.giver).setY(1.75));for(let e of t){let t=`gate:${e.quest}`;this.state.open.has(e.quest)&&!r.has(t)&&r.set(t,new B(e.x+e.w/2,1.1,e.y+e.h/2))}for(let[e,t]of this.marks)r.has(e)||(this.scene.remove(t),this.marks.delete(e));for(let[e,t]of r){if(this.marks.has(e))continue;let n=this.kit.mesh(new ne(.17,0),this.kit.mat(`#f5c542`,{emissive:`#f0a020`,rough:.4}),!1);n.scale.set(.8,1.3,.8),n.position.copy(t),n.userData.base=t.y,this.scene.add(n),this.marks.set(e,n)}}listen(){let e=this.renderer.domElement,t=new te,n=new x(new B(0,1,0),0),r=new B,i=i=>{let a=e.getBoundingClientRect(),o=new E((i.clientX-a.left)/a.width*2-1,-((i.clientY-a.top)/a.height)*2+1);if(t.setFromCamera(o,this.camera),!t.ray.intersectPlane(n,r))return null;let s={x:Math.floor(r.x),y:Math.floor(r.z)},{width:c,height:l}=this.options.map;return s.x>=0&&s.y>=0&&s.x<c&&s.y<l?s:null},a=null,o=e=>{a={x:e.clientX,y:e.clientY}},s=e=>{let t=a;if(a=null,this.paused||!t||Math.hypot(e.clientX-t.x,e.clientY-t.y)>12)return;let n=i(e);n&&this.walkTo(n)},c=e=>{if(this.paused||e.pointerType!==`mouse`){this.hover.visible=!1;return}let t=i(e);this.hover.visible=t!==null,t&&this.hover.position.set(t.x+.5,this.groundUnder(t.x+.5,t.y+.5)+.04,t.y+.5)},l=()=>{this.hover.visible=!1},u=e=>e instanceof HTMLElement&&(e.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)),d=e=>{if(this.paused||u(e.target))return;let t=mt[e.code];t&&(this.held.add(e.code),!e.repeat&&this.presses.length<dt&&this.presses.push(t))},f=e=>{this.held.delete(e.code)};e.addEventListener(`pointerdown`,o),e.addEventListener(`pointerup`,s),e.addEventListener(`pointermove`,c),e.addEventListener(`pointerleave`,l),window.addEventListener(`keydown`,d),window.addEventListener(`keyup`,f),this.cleanups.push(()=>{e.removeEventListener(`pointerdown`,o),e.removeEventListener(`pointerup`,s),e.removeEventListener(`pointermove`,c),e.removeEventListener(`pointerleave`,l),window.removeEventListener(`keydown`,d),window.removeEventListener(`keyup`,f)})}walkTo(e){let t=this.options.map,n=fe(t,this.state.completed,e);this.intent=ht(e,t.giver)?{kind:`giver`}:n?{kind:`gate`,gate:n}:null,this.route=[...ue(this.grid,this.cell,e).steps],this.calm||(this.tapRing.position.set(e.x+.5,this.groundUnder(e.x+.5,e.y+.5)+.05,e.y+.5),this.tapT=0),this.stepTo||this.advance()}advance(){let e=this.route.shift();!e||!me(this.grid,e)?(this.route=[],this.stepFrom=null,this.stepTo=null,this.arrive()):(this.stepFrom=gt(this.cell),this.stepTo=gt(e),this.stepT=0,this.hero.group.rotation.y=Math.atan2(e.x-this.cell.x,e.y-this.cell.y),this.cell=e)}arrive(){let e=this.intent;this.intent=null;let t=this.options.map,n=e=>this.options.onEvent(e);n({kind:`moved`,at:this.cell}),le(t.exit,this.cell)?n({kind:`exit`}):e?.kind===`giver`?Math.abs(t.giver.x-this.cell.x)+Math.abs(t.giver.y-this.cell.y)===1&&n({kind:`giver`}):e?.kind===`gate`&&_t(e.gate,this.cell)===1&&n({kind:`gate`,quest:e.gate.quest})}heldStep(){let e=0,t=0;for(let n of this.held){let r=mt[n];r&&(e+=r.x,t+=r.y)}return e===0?t===0?null:{x:0,y:Math.sign(t)}:{x:Math.sign(e),y:0}}keyboard(){if(this.stepTo||this.route.length>0)return;let e=this.presses.shift()??null,t=e??this.heldStep();if(!t)return;let n={x:this.cell.x+t.x,y:this.cell.y+t.y};if(me(this.grid,n)){this.route=[n],this.advance();return}if(!e)return;let r=this.options.map;if(ht(n,r.giver)){this.hero.group.rotation.y=Math.atan2(t.x,t.y),this.options.onEvent({kind:`giver`});return}let i=fe(r,this.state.completed,n);i&&this.options.onEvent({kind:`gate`,quest:i.quest})}frame(){let e=Math.min(this.clock.getDelta(),.05),t=this.clock.elapsedTime;this.paused||this.keyboard();let n=this.hero;this.stepFrom&&this.stepTo?(this.stepT=Math.min(1,this.stepT+e/ut),n.group.position.lerpVectors(this.stepFrom,this.stepTo,this.stepT),this.walkPhase+=e*14,this.stepT>=1&&(this.stepFrom=null,this.stepTo=null,this.advance())):this.walkPhase*=.8;let r=Math.sin(this.walkPhase)*(this.stepTo?.6:0);n.legs[0]?.rotation.set(r,0,0),n.legs[1]?.rotation.set(-r,0,0),n.arms[0]?.rotation.set(-r*.8,0,-.12),n.arms[1]?.rotation.set(r*.8,0,.12);let i=this.groundUnder(n.group.position.x,n.group.position.z);if(n.group.position.y=i+(this.stepTo?Math.abs(Math.sin(this.walkPhase))*.05:0),this.heroShadow.position.set(n.group.position.x,i+.03,n.group.position.z),!this.calm){this.waterMaterial.uniforms.uTime.value=t,this.ground.update(t);for(let e of this.idlers)e.group.position.y=e.base+Math.sin(t*1.6+e.phase)*.012;for(let e of this.floaters)e.group.position.y=e.base+Math.sin(t*1.3+e.phase)*.035,e.group.rotation.z=Math.sin(t*1.1+e.phase)*.04;for(let e of this.sway){let n=e.userData.phase;e.rotation.x=Math.sin(t*1.4+n)*.12}for(let e of this.marks.values())e.rotation.y=t*1.6,e.position.y=e.userData.base+Math.sin(t*2.4)*.08;this.tapT<1&&(this.tapT=Math.min(1,this.tapT+e*2.5),this.tapRing.scale.setScalar(1+this.tapT*.8),this.tapRing.material.opacity=(1-this.tapT)*.8)}for(let t=this.growing.length-1;t>=0;--t){let n=this.growing[t];if(!n)continue;n.t=Math.min(1,n.t+e*1.6);let r=1-(1-n.t)**3;n.group.position.y=-.8*(1-r),n.t>=1&&this.growing.splice(t,1)}let a=this.clampTarget(n.group.position);this.cameraTarget.lerp(a,1-Math.exp(-e*5)),this.placeCamera(),this.finish.render(e)}clampTarget(e){let{width:t,height:n}=this.options.map,r=this.cameraDistance()*Math.tan(this.camera.fov*Math.PI/360)*this.camera.aspect,i=Math.min(t/2,Math.max(1.5,r*.75));return new B(Math.min(t-i,Math.max(i,e.x)),0,Math.min(n-3,Math.max(4,e.z)))}cameraDistance(){let e=this.camera.aspect;return e<.9?17:e<1.3?15:13.5}placeCamera(){let e=this.cameraDistance(),t=this.cameraTarget;this.camera.position.set(t.x,t.y+e*.64,t.z+e*.77),this.camera.lookAt(t.x,t.y,t.z-1.2),this.sun.position.set(t.x+pt.x*22,pt.y*22,t.z+pt.z*22),this.sun.target.position.set(t.x,0,t.z)}fit(){let e=this.options.parent,t=Math.max(1,e.clientWidth),n=Math.max(1,e.clientHeight);this.renderer.setSize(t,n,!1),this.renderer.domElement.style.width=`${t}px`,this.renderer.domElement.style.height=`${n}px`,this.camera.aspect=t/n,this.camera.updateProjectionMatrix(),this.finish.setSize(t,n),this.framed||(this.framed=!0,this.cameraTarget.copy(this.clampTarget(this.hero.group.position))),this.placeCamera(),this.paused&&this.finish.render()}groundUnder(e,t){let n={x:Math.floor(e),y:Math.floor(t)};return this.description.deck.some(e=>ht(e,n))?.17:this.ground.heightAt(e,t)}};function At(e){return new kt(e)}export{At as createZoneGame};