import{A as e,C as t,D as n,E as r,F as i,I as a,L as o,M as s,N as c,O as l,P as u,R as d,S as f,T as p,_ as m,a as h,b as g,c as _,d as v,f as y,g as b,h as x,i as S,j as C,k as w,l as T,m as E,n as D,o as O,p as k,r as ee,s as A,u as j,v as te,w as M,x as N,y as ne}from"./CampusRoute-Cly_3z5e.js";var P=class e extends f{constructor(){let t=e.SkyShader,n=new s({name:t.name,uniforms:i.clone(t.uniforms),vertexShader:t.vertexShader,fragmentShader:t.fragmentShader,side:1,depthWrite:!1});super(new h(1,1,1),n),this.isSky=!0}};P.SkyShader={name:`SkyShader`,uniforms:{turbidity:{value:2},rayleigh:{value:1},mieCoefficient:{value:.005},mieDirectionalG:{value:.8},sunPosition:{value:new d},cloudScale:{value:2e-4},cloudSpeed:{value:2e-5},cloudCoverage:{value:.4},cloudDensity:{value:.4},cloudElevation:{value:.5},showSunDisc:{value:1},time:{value:0}},vertexShader:`
		uniform vec3 sunPosition;
		uniform float rayleigh;
		uniform float turbidity;
		uniform float mieCoefficient;

		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying float vSunfade;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		// constants for atmospheric scattering
		const float e = 2.71828182845904523536028747135266249775724709369995957;
		const float pi = 3.141592653589793238462643383279502884197169;

		// wavelength of used primaries, according to preetham
		const vec3 lambda = vec3( 680E-9, 550E-9, 450E-9 );
		// this pre-calculation replaces older TotalRayleigh(vec3 lambda) function:
		// (8.0 * pow(pi, 3.0) * pow(pow(n, 2.0) - 1.0, 2.0) * (6.0 + 3.0 * pn)) / (3.0 * N * pow(lambda, vec3(4.0)) * (6.0 - 7.0 * pn))
		const vec3 totalRayleigh = vec3( 5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5 );

		// mie stuff
		// K coefficient for the primaries
		const float v = 4.0;
		const vec3 K = vec3( 0.686, 0.678, 0.666 );
		// MieConst = pi * pow( ( 2.0 * pi ) / lambda, vec3( v - 2.0 ) ) * K
		const vec3 MieConst = vec3( 1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14 );

		// earth shadow hack
		// cutoffAngle = pi / 1.95;
		const float cutoffAngle = 1.6110731556870734;
		const float steepness = 1.5;
		const float EE = 1000.0;

		float sunIntensity( float zenithAngleCos ) {
			zenithAngleCos = clamp( zenithAngleCos, -1.0, 1.0 );
			return EE * max( 0.0, 1.0 - pow( e, -( ( cutoffAngle - acos( zenithAngleCos ) ) / steepness ) ) );
		}

		vec3 totalMie( float T ) {
			float c = ( 0.2 * T ) * 10E-18;
			return 0.434 * c * MieConst;
		}

		void main() {

			vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
			vWorldPosition = worldPosition.xyz;

			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			gl_Position.z = gl_Position.w; // set z to camera.far

			vSunDirection = normalize( sunPosition );

			vSunE = sunIntensity( vSunDirection.y );

			vSunfade = 1.0 - clamp( 1.0 - exp( ( sunPosition.y / 450000.0 ) ), 0.0, 1.0 );

			float rayleighCoefficient = rayleigh - ( 1.0 * ( 1.0 - vSunfade ) );

			// extinction (absorption + out scattering)
			// rayleigh coefficients
			vBetaR = totalRayleigh * rayleighCoefficient;

			// mie coefficients
			vBetaM = totalMie( turbidity ) * mieCoefficient;

		}`,fragmentShader:`
		varying vec3 vWorldPosition;
		varying vec3 vSunDirection;
		varying vec3 vBetaR;
		varying vec3 vBetaM;
		varying float vSunE;

		uniform float mieDirectionalG;
		uniform float cloudScale;
		uniform float cloudSpeed;
		uniform float cloudCoverage;
		uniform float cloudDensity;
		uniform float cloudElevation;
		uniform float showSunDisc;
		uniform float time;

		// gradient at a lattice corner; sinless hash so every GPU produces the same clouds
		vec2 gradient( vec2 i ) {
			vec3 p = fract( i.xyx * vec3( 0.1031, 0.1030, 0.0973 ) );
			p += dot( p, p.yzx + 33.33 );
			return fract( ( p.xx + p.yz ) * p.zy ) * 2.0 - 1.0;
		}

		// 2D gradient noise: isotropic lobes like Perlin at value-noise cost
		float noise( vec2 p ) {
			vec2 i = floor( p );
			vec2 f = fract( p );
			vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 ); // quintic fade
			float a = dot( gradient( i ), f );
			float b = dot( gradient( i + vec2( 1.0, 0.0 ) ), f - vec2( 1.0, 0.0 ) );
			float c = dot( gradient( i + vec2( 0.0, 1.0 ) ), f - vec2( 0.0, 1.0 ) );
			float d = dot( gradient( i + vec2( 1.0, 1.0 ) ), f - vec2( 1.0, 1.0 ) );
			return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y ) * 1.6; // ~[-1,1]
		}

		// fbm; per-octave drift makes clouds billow instead of scrolling as a rigid stamp
		float fbm( vec2 p, float drift ) {
			float result = 0.0;
			float amplitude = 1.0;
			for ( int i = 0; i < 4; i ++ ) {
				result += amplitude * noise( p );
				amplitude *= 0.5;
				p = p * 2.0 + drift;
			}
			return result;
		}

		// constants for atmospheric scattering
		const float pi = 3.141592653589793238462643383279502884197169;

		const float n = 1.0003; // refractive index of air
		const float N = 2.545E25; // number of molecules per unit volume for air at 288.15K and 1013mb (sea level -45 celsius)

		// optical length at zenith for molecules
		const float rayleighZenithLength = 8.4E3;
		const float mieZenithLength = 1.25E3;
		// 66 arc seconds -> degrees, and the cosine of that
		const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;

		// 3.0 / ( 16.0 * pi )
		const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
		// 1.0 / ( 4.0 * pi )
		const float ONE_OVER_FOURPI = 0.07957747154594767;

		float rayleighPhase( float cosTheta ) {
			return THREE_OVER_SIXTEENPI * ( 1.0 + pow( cosTheta, 2.0 ) );
		}

		float hgPhase( float cosTheta, float g ) {
			float g2 = pow( g, 2.0 );
			float inverse = 1.0 / pow( 1.0 - 2.0 * g * cosTheta + g2, 1.5 );
			return ONE_OVER_FOURPI * ( ( 1.0 - g2 ) * inverse );
		}

		void main() {

			vec3 direction = normalize( vWorldPosition - cameraPosition );

			// optical length
			// cutoff angle at 90 to avoid singularity in next formula.
			float zenithAngle = acos( max( 0.0, direction.y ) );
			float inverse = 1.0 / ( cos( zenithAngle ) + 0.15 * pow( 93.885 - ( ( zenithAngle * 180.0 ) / pi ), -1.253 ) );
			float sR = rayleighZenithLength * inverse;
			float sM = mieZenithLength * inverse;

			// combined extinction factor
			vec3 Fex = exp( -( vBetaR * sR + vBetaM * sM ) );

			// in scattering
			float cosTheta = dot( direction, vSunDirection );

			float rPhase = rayleighPhase( cosTheta * 0.5 + 0.5 );
			vec3 betaRTheta = vBetaR * rPhase;

			float mPhase = hgPhase( cosTheta, mieDirectionalG );
			vec3 betaMTheta = vBetaM * mPhase;

			vec3 Lin = pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * ( 1.0 - Fex ), vec3( 1.5 ) );
			Lin *= mix( vec3( 1.0 ), pow( vSunE * ( ( betaRTheta + betaMTheta ) / ( vBetaR + vBetaM ) ) * Fex, vec3( 1.0 / 2.0 ) ), clamp( pow( 1.0 - vSunDirection.y, 5.0 ), 0.0, 1.0 ) );

			// nightsky
			float theta = acos( direction.y ); // elevation --> y-axis, [-pi/2, pi/2]
			float phi = atan( direction.z, direction.x ); // azimuth --> x-axis [-pi/2, pi/2]
			vec2 uv = vec2( phi, theta ) / vec2( 2.0 * pi, pi ) + vec2( 0.5, 0.0 );
			vec3 L0 = vec3( 0.1 ) * Fex;

			// composition + solar disc
			float sundisc = clamp( ( cosTheta - sunAngularDiameterCos ) * 50000.0, 0.0, 1.0 ) * showSunDisc;
			vec3 sundiscColor = ( 760.0 * sundisc ) * min( vSunE * Fex, 80.0 );

			vec3 texColor = ( Lin + L0 ) * 0.04 + sundiscColor + vec3( 0.0, 0.0003, 0.00075 );

			// Clouds
			if ( direction.y > 0.0 && cloudCoverage > 0.0 ) {

				// Project to cloud plane (higher elevation = clouds appear lower/closer)
				float elevation = mix( 1.0, 0.1, cloudElevation );
				vec2 cloudUV = direction.xz / ( direction.y * elevation );
				cloudUV *= cloudScale;
				cloudUV += time * cloudSpeed;

				// Cloud density field
				float evolve = time * cloudSpeed * 300.0;
				float cloudNoise = clamp( fbm( cloudUV * 1000.0, evolve ) * 0.7 + 0.5, 0.0, 1.0 );

				// Large-scale coverage variation: clear gaps next to dense banks
				float region = noise( cloudUV * 300.0 ) * 0.37 + 0.5;
				float cov = clamp( cloudCoverage + ( region - 0.5 ) * 0.6, 0.0, 1.0 );

				// Carve clouds where noise rises above the coverage level
				float threshold = 1.0 - cov;
				float cloudMask = smoothstep( threshold, threshold + 0.3, cloudNoise );

				// Fade clouds near horizon (adjusted by elevation)
				float horizonFade = smoothstep( 0.0, 0.03 + 0.06 * cloudElevation, direction.y );
				cloudMask *= horizonFade;

				// Cloud lighting from the sky's own radiance
				float dayFactor = smoothstep( -0.08, 0.3, vSunDirection.y );
				vec3 sunColor = vSunE * Fex * 0.22 * 0.04; // 0.22 ~ albedo/pi, 0.04 = exposure; the aerial composite adds the eye-leg extinction
				vec3 skyAmbient = Lin * 0.04 + vec3( 0.0, 0.0003, 0.00075 );

				// Beer-powder self-shadow from the sampled density
				float depth = max( 0.0, cloudNoise - threshold );
				float beer = exp( depth * -4.0 );
				float powder = 1.0 - beer * beer; // beer*beer == exp(-8*depth)
				float shade = mix( 0.45, 1.0, clamp( beer * powder * 2.6, 0.0, 1.0 ) ); // 2.6 = 1/0.385, normalizes beer*powder peak to 1

				// Henyey-Greenstein forward lobe ( g = 0.7 ): silver lining on rims toward the sun
				float silver = clamp( 0.51 / pow( 1.49 - cosTheta * 1.4, 1.5 ), 0.0, 3.0 ); // 0.51=1-g^2, 1.49=1+g^2, 1.4=2g
				float edge = cloudMask * ( 1.0 - cloudMask ) * 4.0;

				vec3 cloudColor = skyAmbient + sunColor * shade;
				cloudColor += sunColor * silver * edge * 0.6;
				cloudColor *= max( dayFactor, 0.03 );

				// Cloud opacity via Beer's law: density sets how solid the clouds get
				float alpha = ( 1.0 - exp( depth * cloudDensity * -12.0 ) ) * horizonFade;

				// Occlude the sun disc/glow behind opaque cloud
				texColor -= L0 * 0.04 * alpha;

				// Composite through the atmosphere so distant clouds dissolve into haze
				vec3 cloudAerial = mix( texColor, cloudColor, Fex );
				texColor = mix( texColor, cloudAerial, alpha );

			}

			gl_FragColor = vec4( texColor, 1.0 );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>

		}`};function F(e){let t=e>>>0||1;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function re(e){let t=0;for(let n=0;n<e.length;n++){let r=e[n],i=e[(n+1)%e.length];r&&i&&(t+=r[0]*i[1]-i[0]*r[1])}return t/2}function I(e,t){let n=!1;for(let r=0,i=t.length-1;r<t.length;i=r++){let a=t[r],o=t[i];a&&o&&a[1]>e[1]!=o[1]>e[1]&&e[0]<(o[0]-a[0])*(e[1]-a[1])/(o[1]-a[1])+a[0]&&(n=!n)}return n}function ie(e,t,n){if(t!==null&&t>=1)return Math.min(t,40);let r=F(4100+n)();return e<45?1:e<120?2+Math.floor(r*4):e<450?5+Math.floor(r*5):e<2e3?6+Math.floor(r*7):4+Math.floor(r*6)}function L(e,t,n){let r=n[0]-t[0],i=n[1]-t[1],a=r*r+i*i,o=a>0?Math.max(0,Math.min(1,((e[0]-t[0])*r+(e[1]-t[1])*i)/a)):0;return Math.hypot(e[0]-(t[0]+o*r),e[1]-(t[1]+o*i))}var R=new Set([`primary`,`secondary`,`tertiary`,`trunk`,`residential`,`unclassified`,`living_street`]);function z(e,t){return e.map(e=>{let n=e.map(e=>e[0]),r=e.map(e=>e[1]);return{x1:Math.min(...n)-t,x2:Math.max(...n)+t,y1:Math.min(...r)-t,y2:Math.max(...r)+t,outline:e}})}function B(e,t,n){return e[0]>t.x1-n&&e[0]<t.x2+n&&e[1]>t.y1-n&&e[1]<t.y2+n}function ae(e,t,n=1){let r=Number.isFinite(n)&&n>0?n:1,i=F(4200),a=z(e.buildings.map(e=>e.outline),1.5),o=z(e.water,1),s=e.roads.filter(e=>!e.kind.startsWith(`water-`)),c=e=>B(e,t,3)||a.some(t=>e[0]>t.x1&&e[0]<t.x2&&e[1]>t.y1&&e[1]<t.y2&&(I(e,t.outline)||V(e,t.outline,1.5)))||o.some(t=>e[0]>t.x1&&e[0]<t.x2&&e[1]>t.y1&&e[1]<t.y2&&I(e,t.outline))||s.some(t=>{for(let n=1;n<t.path.length;n++){let r=t.path[n-1],i=t.path[n];if(r&&i&&L(e,r,i)<t.width/2+.8)return!0}return!1}),l=e.trees.filter(e=>!B(e,t,3));for(let t of e.roads){if(!R.has(t.kind))continue;let e=t.width/2+1.8,n=i()*12;for(let a=1;a<t.path.length;a++){let o=t.path[a-1],s=t.path[a];if(!o||!s)continue;let u=Math.hypot(s[0]-o[0],s[1]-o[1]);if(u<.01)continue;let d=(s[0]-o[0])/u,f=(s[1]-o[1])/u;for(;n<u;n+=(11+i()*6)*r)for(let t of[-1,1]){if(i()<.35)continue;let r=[o[0]+d*n-f*e*t,o[1]+f*n+d*e*t];c(r)||l.push(r)}n-=u}}for(let t of e.green){if(t.kind===`pitch`)continue;let e=t.outline.map(e=>e[0]),n=t.outline.map(e=>e[1]),a=9*Math.sqrt(r);for(let r=Math.min(...e);r<Math.max(...e);r+=a)for(let e=Math.min(...n);e<Math.max(...n);e+=a){let n=[r+(i()-.5)*a,e+(i()-.5)*a];i()<.45&&I(n,t.outline)&&!c(n)&&l.push(n)}}return l}function V(e,t,n){for(let r=0;r<t.length;r++){let i=t[r],a=t[(r+1)%t.length];if(i&&a&&L(e,i,a)<n)return!0}return!1}function oe(e,t,n=1){let r=Number.isFinite(n)&&n>0?n:1,i=F(4300),a=[],o=.12,s=Math.cos(o),c=Math.sin(o);for(let n=-t;n<t;){let l=70+i()*40;for(let u=-t;u<t;){let d=50+i()*30;for(let f=n+2;f<n+l-6;){let n=12+i()*12;for(let l of[0,1]){let p=d/2-3,m=f+n/2,h=u+(l===0?p/2+1:d-p/2-1),g=m*s-h*c,_=m*c+h*s,v=Math.hypot(g,_),y=v>=e&&v<=t&&i()<(v<t*.6?.82:.6)/r,b=i();y&&a.push({x:g,y:_,length:n-1.5,width:p-1-i()*4,storeys:b<.04?14+Math.floor(i()*10):4+Math.floor(i()*7),turn:o,tone:i()})}f+=n}u+=d+12}n+=l+12}return a}var H={trunk:2.2,primary:2.2,secondary:1.8,tertiary:1.4,residential:.9,unclassified:.8,living_street:.6,service:.35};function se(e,t,n=1){let r=Number.isFinite(n)&&n>0?n:1,i=F(4500),a=[];for(let n of e.roads){let e=H[n.kind];if(e===void 0||n.width<4)continue;let o=n.width>=10;for(let s=1;s<n.path.length;s++){let c=n.path[s-1],l=n.path[s];if(!c||!l)continue;let u=Math.hypot(l[0]-c[0],l[1]-c[1]);if(u<2)continue;let d=(l[0]-c[0])/u,f=(l[1]-c[1])/u,p=Math.floor(u/10*(e/r)+i());for(let e=0;e<p;e++){let e=2+i()*Math.max(0,u-4),r=i()<.5?-1:1,s=i()<(o?.1:.35),l=i(),p=o&&l<.12?`bus`:l<(o?.55:.4)?`car`:l<.75?`cng`:`rickshaw`,m=n.width/2,h=s?m-(p===`bus`?1.6:1.1):m/2,g=c[0]+d*e-f*h*r,_=c[1]+f*e+d*h*r;if(B([g,_],t,4))continue;let v=Math.atan2(f,d)+(r<0?Math.PI:0)+(i()-.5)*.08;a.push({x:g,y:_,turn:v,kind:p,tone:i()})}}}return a}function ce(e,t){let n=F(4600),r=z(e.buildings.map(e=>e.outline),.5),i=[],a=[];for(let o of e.roads){if(!R.has(o.kind)&&o.kind!==`service`)continue;let e=n()<.5?-1:1,s=o.width/2+.7,c=n()*20,l=-1;for(let u=1;u<o.path.length;u++){let d=o.path[u-1],f=o.path[u];if(!d||!f)continue;let p=Math.hypot(f[0]-d[0],f[1]-d[1]);if(p<.01)continue;let m=(f[0]-d[0])/p,h=(f[1]-d[1])/p;for(;c<p;c+=28+n()*8){let n=[d[0]+m*c-h*s*e,d[1]+h*c+m*s*e];B(n,t,3)||r.some(e=>n[0]>e.x1&&n[0]<e.x2&&n[1]>e.y1&&n[1]<e.y2&&I(n,e.outline))?l=-1:(i.push({x:n[0],y:n[1]}),l>=0&&a.push([l,i.length-1]),l=i.length-1)}c-=p}}return{poles:i,spans:a}}function le(e){let t=new Map;for(let n of e.roads){if(!R.has(n.kind))continue;let e=n.width/2;for(let r=1;r<n.path.length;r++){let i=n.path[r-1],a=n.path[r];if(!i||!a)continue;let o={a:i,b:a,half:e},s=Math.floor((Math.min(i[0],a[0])-e)/20),c=Math.floor((Math.max(i[0],a[0])+e)/20),l=Math.floor((Math.min(i[1],a[1])-e)/20),u=Math.floor((Math.max(i[1],a[1])+e)/20);for(let e=s;e<=c;e++)for(let n=l;n<=u;n++){let r=`${e},${n}`,i=t.get(r)??[];i.push(o),t.set(r,i)}}}return(e,n)=>{let r=Math.floor((e[0]-n)/20),i=Math.floor((e[0]+n)/20),a=Math.floor((e[1]-n)/20),o=Math.floor((e[1]+n)/20);for(let s=r;s<=i;s++)for(let r=a;r<=o;r++)for(let i of t.get(`${s},${r}`)??[])if(L(e,i.a,i.b)<=i.half+n)return!0;return!1}}new Map([{id:`nikunja`,name:`Nikunja`,label:`Nikunja`,aka:`Nikunjo`,kind:`dormitory`,levels:10,levelsFrom:`osm`,roof:`hip`,roofParts:[{cx:109.2,cy:-74.5,length:44,width:21.7,angle:30.8},{cx:149.9,cy:-51.7,length:37.1,width:24.2,angle:30.8}],facade:`dorm`,osmWay:1181827288,about:`Dormitory. OpenStreetMap names it Nikunja and gives it ten storeys; the RS handbook spells it Nikunjo. The tallest building on campus: two hipped red roofs with raised ridge lights, over white walls with balconies.`,footprint:[[84.7,-76.5],[88.1,-82.1],[91.8,-88.3],[100,-83.5],[103.8,-89.1],[133.6,-72.6],[131.6,-69.2],[136.8,-66],[140.1,-71.5],[165.2,-56.4],[161.8,-50],[164.4,-47.9],[161.7,-41.1],[163.6,-39.7],[159.6,-31.8]]},{id:`maloncho`,name:`Maloncho`,label:`Maloncho`,aka:`Malancha`,kind:`dormitory`,levels:6,levelsFrom:`osm`,roof:`flat-stubs`,facade:`dorm`,osmWay:1181827287,about:`Dormitory. OpenStreetMap names it Maloncho and gives it six storeys; the RS handbook's duty list mentions the Maloncho dormitory field. In the February 2026 satellite image its flat roof carries column stubs, the way a building is left ready for another floor.`,footprint:[[71.3,-59.2],[76.5,-67.6],[112.4,-45.4],[110,-41.6],[117.3,-37.1],[119.2,-40.1],[148.8,-21.8],[140.7,-8.9],[133.7,-13.2],[127.4,-3.3],[104,-17.8],[108.9,-25.5],[102,-29.8],[97.6,-22.9],[74.8,-37],[81,-47],[75.6,-50.4],[78.3,-54.9]]},{id:`east-block`,name:null,label:`East block`,kind:`unknown`,levels:6,levelsFrom:`photo`,roof:`flat`,facade:`fins`,osmWay:1181827284,about:`The building with the rounded west end, north of the gate. Six storeys counted in the RS handbook's photograph of it: white walls, yellow window fins and red-brick sills. OpenStreetMap tags it as a café; no public source says what it is used for.`,footprint:[[125.8,39.7],[122,31.3],[127.2,24],[152.3,37],[140.4,79.1],[105.6,73.7],[109.7,58.2],[119.5,60.9],[120.6,58],[118.5,54.7],[118.5,52],[118.5,49],[120.1,44.6],[122.6,41.6]]},{id:`dorm-two-wing`,name:null,label:`Three-storey dormitory`,kind:`dormitory`,levels:3,levelsFrom:`osm`,roof:`hip`,roofParts:[{cx:24.8,cy:48.4,length:32.6,width:11.8,angle:33.2},{cx:50.2,cy:43.4,length:30.3,width:10.9,angle:33}],facade:`dorm`,osmWay:1236280106,about:`Two hipped-roof wings joined by a stair. OpenStreetMap tags it as a dormitory of three storeys but gives no name.`,footprint:[[8,44.5],[35.2,62.3],[41.3,53],[35.9,49.5],[40,43.2],[59.9,56.2],[65.9,47.1],[40.5,30.6],[34.9,39.1],[33.7,38.3],[29.6,44.5],[14.4,34.6]]},{id:`north-block`,name:null,label:`North block`,kind:`unknown`,levels:3,levelsFrom:`osm`,roof:`hip`,roofParts:[{cx:85,cy:52.9,length:29.3,width:14.4,angle:21.2}],facade:`dorm`,osmWay:587837339,about:`Three storeys under a hipped red roof, like the dormitories beside it. OpenStreetMap gives its height but not its name or use.`,footprint:[[68.8,54.3],[96,64.9],[101.3,51.5],[74,40.9]]},{id:`courtyard-building`,name:null,label:`Courtyard building`,kind:`unknown`,levels:4,levelsFrom:`imagery`,roof:`flat`,facade:`bands`,osmWay:1181827286,about:`A U-shaped, flat-roofed building round a courtyard that opens to the north-east, with stepped terraces along one side. Probably the main academic building whose courtyard BRACU had redesigned, but no source names it. The storey count is estimated from how far it leans in the satellite image.`,footprint:[[55.4,-69.6],[61.4,-63.3],[51.3,-48.1],[37.6,-56.3],[31.1,-61.2],[37.6,-97.3],[75.7,-90],[83.6,-88.1],[75.7,-76.9],[70.3,-77.9],[45.3,-82.6],[46.1,-78.6],[45.3,-74.2],[43.9,-71.2]]},{id:`anandapur`,name:`Anandapur`,label:`Anandapur`,aka:`Anondopur`,kind:`hall`,levels:1,levelsFrom:`imagery`,roof:`gable`,roofParts:[{cx:-17.6,cy:38.5,length:37.2,width:25,angle:-57.3}],facade:`hall`,osmWay:587837346,about:`The big red-roofed hall by the fields. OpenStreetMap names it Anandapur; the RS handbook lists Anandapur as a Wi-Fi zone and gives students cleaning duty in and around it. Single-storey; its height is estimated.`,footprint:[[-38.2,47.4],[-17.2,60.8],[3,29.6],[-18.1,16.1]]},{id:`west-block`,name:null,label:`West block`,kind:`unknown`,levels:5,levelsFrom:`imagery`,roof:`flat`,facade:`bands`,osmWay:1181827281,about:`A small white block near the west wall. Five storeys, estimated from its lean and shadow in the satellite image; no source names it.`,footprint:[[-129,37.8],[-115.6,39.9],[-114.2,31],[-127.6,28.9]]},{id:`west-shed`,name:null,label:`Long shed, west`,kind:`shed`,levels:1,levelsFrom:`imagery`,roof:`gable`,roofParts:[{cx:-143.6,cy:33.9,length:21.5,width:8.1,angle:-3.2}],facade:`shed`,osmWay:1181827282,about:`A single-storey shed with a red roof.`,footprint:[[-154,38.6],[-132.6,37.4],[-133.1,29.4],[-154.5,30.5]]},{id:`north-west-shed`,name:null,label:`Long shed, north-west`,kind:`shed`,levels:1,levelsFrom:`imagery`,roof:`gable`,roofParts:[{cx:-146.1,cy:75.2,length:22.3,width:8.8,angle:88.7}],facade:`shed`,osmWay:1341427979,about:`A single-storey shed with a red roof in the strip of land along the north-west wall.`,footprint:[[-142,63.9],[-141.5,86.2],[-150.2,86.4],[-150.8,64.1]]},{id:`hut-south`,name:null,label:`Small shed`,kind:`shed`,levels:1,levelsFrom:`imagery`,roof:`gable`,roofParts:[{cx:-140,cy:16.5,length:8.1,width:6,angle:9.3}],facade:`shed`,osmWay:null,about:`A small red-roofed shed among the trees, traced from the satellite image; not in OpenStreetMap.`,footprint:[[-143.4,12.9],[-135.5,14.2],[-136.6,20.1],[-144.5,18.8]]},{id:`hut-south-2`,name:null,label:`Small shed`,kind:`shed`,levels:1,levelsFrom:`imagery`,roof:`gable`,roofParts:[{cx:-128.5,cy:7.5,length:10.1,width:5,angle:15}],facade:`shed`,osmWay:null,about:`A small red-roofed shed among the trees, traced from the satellite image; not in OpenStreetMap.`,footprint:[[-132.7,3.8],[-123,6.4],[-124.3,11.2],[-134,8.6]]}].map(e=>[e.id,e]));function U(e,t){let n=e.length,r=e[(t%n+n)%n];if(!r)throw RangeError(`empty outline`);return r}function ue(e){let t=0;for(let n=0;n<e.length;n++){let[r,i]=U(e,n),[a,o]=U(e,n+1);t+=r*o-a*i}return t/2}function W(e){let t=e>>>0;return()=>{t=t+1831565813>>>0;let e=t;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}}function G(e,t,n){let r=e*374761393+t*668265263+n*2147483647|0;return r=Math.imul(r^r>>>13,1274126177),r^=r>>>16,(r>>>0)/4294967296}function de(e,t,n,r){let i=Math.floor(e),a=Math.floor(t),o=e-i,s=t-a,c=e=>(e%n+n)%n,l=G(c(i),c(a),r),u=G(c(i+1),c(a),r),d=G(c(i),c(a+1),r),f=G(c(i+1),c(a+1),r),p=o*o*(3-2*o),m=s*s*(3-2*s);return l+(u-l)*p+(d-l)*m+(l-u-d+f)*p*m}function K(e,t,n,r,i){let a=0,o=.5,s=0,c=n;for(let n=0;n<r;n++)a+=o*de(e*c,t*c,c,i+n*17),s+=o,o*=.5,c*=2;return a/s}function q(e){let t=new Uint8ClampedArray(new ArrayBuffer(e*e*4));return{size:e,data:t,set(e,n,r,i,a=255){let o=e*4;t[o]=n,t[o+1]=r,t[o+2]=i,t[o+3]=a}}}function J(e,t){let n=document.createElement(`canvas`);n.width=e.size,n.height=e.size;let r=n.getContext(`2d`);return r&&r.putImageData(new ImageData(e.data,e.size,e.size),0,0),fe(new A(n),t)}function fe(t,n){return t.colorSpace=n?e:``,t.wrapS=w,t.wrapT=w,t.anisotropy=8,t.generateMipmaps=!0,t.minFilter=g,t.magFilter=ne,t.needsUpdate=!0,t}function pe(e,t,n){let r=new Uint8Array(t*t*4),i=(n,r)=>e[(r+t)%t*t+(n+t)%t]??0;for(let e=0;e<t;e++)for(let a=0;a<t;a++){let o=(i(a+1,e)-i(a-1,e))*n,s=(i(a,e+1)-i(a,e-1))*n,c=Math.hypot(o,s,1),l=(e*t+a)*4;r[l]=(-o/c*.5+.5)*255,r[l+1]=(s/c*.5+.5)*255,r[l+2]=(1/c*.5+.5)*255,r[l+3]=255}return fe(new v(r,t,t,l,a),!1)}var Y=e=>e<0?0:e>255?255:e;function me(e,t,n=1){let r=q(512),i=new Float32Array(262144),a=W(t+5),o=Array.from({length:18},()=>({x:a(),w:.004+a()*.02,len:.15+a()*.55,a:.25+a()*.6}));for(let a=0;a<512;a++)for(let s=0;s<512;s++){let c=s/512,l=a/512,u=K(c,l,8,5,t),d=K(c,l,64,2,t+3),f=0;for(let e of o){let t=Math.min(Math.abs(c-e.x),1-Math.abs(c-e.x));t<e.w&&l<e.len&&(f+=e.a*(1-t/e.w)*(1-l/e.len))}f+=Math.max(0,(l-.82)/.18)*.35,f+=Math.max(0,u-.55)*1.4,f*=n;let p=1-.06*(u-.5)-.03*(d-.5)-.18*Math.min(1,f),m=a*512+s;r.set(m,Y(e[0]*p-f*18),Y(e[1]*p-f*20),Y(e[2]*p-f*24)),i[m]=d*.6+u*.4}return{map:J(r,!0),normalMap:pe(i,512,1.2)}}function he(e,t){let n=q(256),r=new Float32Array(65536);for(let i=0;i<256;i++)for(let a=0;a<256;a++){let o=Math.sin(a/256*13*Math.PI*2),s=K(a/256,i/256,6,4,t),c=Math.max(0,K(a/256,i/256,10,3,t+4)-.62)*2.5,l=.82+.18*o,u=.85+.25*s,d=i*256+a;n.set(d,Y(e[0]*l*u-c*40),Y(e[1]*l*u+c*5),Y(e[2]*l*u-c*10)),r[d]=o*.5+.5}return{map:J(n,!0),normalMap:pe(r,256,3)}}function ge(e){let t=q(128);for(let n=0;n<128;n++)for(let r=0;r<128;r++){let i=Math.sin(n/128*30*Math.PI*2),a=.84+.16*i-(i<-.85?.22:0),o=Math.max(0,n/128-.7)*.9,s=K(r/128,n/128,5,3,e),c=236*a*(.9+.14*s)*(1-o);t.set(n*128+r,Y(c),Y(c),Y(c*.97))}return J(t,!0)}function _e(e){let t=q(256),n=W(e),r=new Uint8Array(65536),i=(e,t,n,i)=>{for(let a=Math.max(0,Math.floor(t));a<Math.min(256,Math.ceil(i));a++)for(let t=Math.max(0,Math.floor(e));t<Math.min(256,Math.ceil(n));t++)r[a*256+t]=1};i(0,0,256,10),i(0,246,256,256);let a=14+n()*10;for(;a<226;){let e=2+Math.floor(n()*4),t=a;for(let t=0;t<e&&a<240;t++){let e=7+n()*6,t=70+n()*40;i(a,40,a+e*.35,40+t),n()<.6&&i(a+e*.35,40+t-14,a+e,40+t),n()<.5&&i(a+e*.65,50,a+e,40+t*.6),a+=e+2}i(t-2,34,a,44),a+=10+n()*8}for(a=30+n()*30;a<216;){let e=3+n()*3;i(a,176,a+e,202+n()*8),a+=e+2+(n()<.2?6:0)}for(let n=0;n<65536;n++){let i=K(n%256/256,Math.floor(n/256)/256,4,2,e+1),a=r[n]?34:240*(.93+.07*i);t.set(n,Y(a),Y(a),Y(r[n]?40:a))}return J(t,!0)}function ve(e,t=172){let n=q(512),r=new Float32Array(262144);for(let i=0;i<512;i++)for(let a=0;a<512;a++){let o=a/512,s=i/512,c=K(o,s,6,5,e),l=Math.max(0,K(o,s,3,4,e+2)-.5)*1.8,u=Math.abs(K(o,s,12,3,e+7)-.5)<.006&&K(o,s,4,2,e+8)>.58?.25:0,d=t*(.9+.2*c)-l*55-u*80,f=i*512+a;n.set(f,Y(d),Y(d-3),Y(d-8-l*6)),r[f]=c}return{map:J(n,!0),normalMap:pe(r,512,1.5)}}function ye(e){let t=q(512),n=new Float32Array(262144);for(let r=0;r<512;r++){let i=r/512*8,a=Math.floor(i),o=i-a,s=a%2?8:4;for(let i=0;i<512;i++){let c=i/512*s+(a%4==1?.5:0),l=Math.floor(c),u=c-l,d=o<.12||u<.05/(s/4),f=G((l%s+s)%s,a,e),p=K(i/512,r/512,32,3,e+1),m=r*512+i;if(d){let e=150+p*30;t.set(m,e,e-6,e-16),n[m]=0}else{let e=.75+.35*f+.15*(p-.5);t.set(m,Y(150*e),Y(72*e),Y(52*e)),n[m]=.8+p*.2}}}return{map:J(t,!0),normalMap:pe(n,512,4)}}var be={width:1.2,height:1.3,sill:.9,grille:!1},xe={width:2,height:1.55,sill:.75,grille:!0};function Se(e,t,n,r=be){let i=me([255,255,255],t,1.6),a=i.map.image,o=e.map((e,n)=>Ce((t,n)=>{t.fillStyle=`rgb(${e[0]},${e[1]},${e[2]})`,t.fillRect(0,0,n,n),a&&(t.globalCompositeOperation=`multiply`,t.drawImage(a,0,0,n,n),t.globalCompositeOperation=`source-over`)},t+n*31,r)),s=null,c=n?.image;return c&&(s=Ce((e,t)=>{let n=t/3,r=t*.6/3.2;for(let i=t-r;i>-r;i-=r)for(let a=0;a<t;a+=n)e.drawImage(c,a,i,n,r)},t+97,r)),i.map.dispose(),{maps:o,brickMap:s,normalMap:i.normalMap??null}}function Ce(e,t,n=be){let r=document.createElement(`canvas`);r.width=256,r.height=256;let i=r.getContext(`2d`);if(i){e(i,256);let r=W(t+9),a=(3-n.width)/2/3*256,o=n.width/3*256,s=256-(n.sill+n.height)/3.2*256,c=n.height/3.2*256;i.fillStyle=`#1f272b`,i.fillRect(a,s,o,c);for(let e=0;e<4;e++){let t=r();t<.5||(i.fillStyle=t<.8?`rgba(120,112,98,0.35)`:`rgba(170,150,120,0.4)`,i.fillRect(a+e*o/4,s,o/4,c))}i.strokeStyle=r()<.5?`#5f6a6e`:`#2f5b4f`,i.lineWidth=3;for(let e=1;e<4;e++)i.beginPath(),i.moveTo(a+e*o/4,s),i.lineTo(a+e*o/4,s+c),i.stroke();if(n.grille){i.strokeStyle=`rgba(214,212,204,0.85)`,i.lineWidth=1.5;for(let e=a+4;e<a+o;e+=7)i.beginPath(),i.moveTo(e,s),i.lineTo(e,s+c),i.stroke();i.lineWidth=2.5;for(let e of[.02,.5,.98])i.beginPath(),i.moveTo(a,s+c*e),i.lineTo(a+o,s+c*e),i.stroke()}i.fillStyle=`rgba(0,0,0,0.25)`,i.fillRect(a-6,s-12,o+12,8),i.fillStyle=`rgba(255,255,255,0.35)`,i.fillRect(a-8,s-16,o+16,5)}return we(r)}function we(e){return fe(new A(e),!0)}function Te(e){let t=q(512),n=W(e);for(let r=0;r<512;r++)for(let i=0;i<512;i++){let a=Y(128+(K(i/512,r/512,16,4,e)-.5)*56+(n()-.5)*10);t.set(r*512+i,a,a,a)}let r=document.createElement(`canvas`);r.width=512,r.height=512;let i=r.getContext(`2d`);if(i){i.putImageData(new ImageData(t.data,512,512),0,0);for(let e=0;e<14;e++){let e=n()*512,t=n()*512,r=10+n()*26;for(let[n,a]of[-512,0,512].flatMap(e=>[-512,0,512].map(t=>[e,t]))){let o=i.createRadialGradient(e+n,t+a,0,e+n,t+a,r);o.addColorStop(0,`rgba(176,176,176,0.55)`),o.addColorStop(1,`rgba(176,176,176,0)`),i.fillStyle=o,i.fillRect(e+n-r,t+a-r,r*2,r*2)}}i.lineCap=`round`;for(let e=0;e<26e3;e++){let e=n()*512,t=n()*512,r=n()*Math.PI*2,a=4+n()*11,o=n()<.5?70+n()*40:150+n()*50;i.strokeStyle=`rgba(${o|0},${o|0},${o|0},${(.35+n()*.4).toFixed(2)})`,i.lineWidth=.8+n()*1.1;let s=Math.cos(r)*a,c=Math.sin(r)*a,l=(n()-.5)*a*.6;for(let n of[0,-512,512])for(let r of[0,-512,512]){let o=e+n,u=t+r;o+a<0||o-a>512||u+a<0||u-a>512||(i.beginPath(),i.moveTo(o,u),i.quadraticCurveTo(o+s/2-c/a*l,u+c/2+s/a*l,o+s,u+c),i.stroke())}}}return fe(new A(r),!1)}var X={x1:-330,x2:330,y1:-240,y2:240},Ee=.5;Math.round((X.x2-X.x1)/Ee),Math.round((X.y2-X.y1)/Ee);function De(e,t,n=X.x2-X.x1,r){let i=new M({map:e,roughness:.97,metalness:0}),a=n/3,o=r?`if ( vGroundAt.x > ${(r.x1+3).toFixed(2)} && vGroundAt.x < ${(r.x2-3).toFixed(2)} && -vGroundAt.y > ${(r.y1+3).toFixed(2)} && -vGroundAt.y < ${(r.y2-3).toFixed(2)} ) discard;`:``;return i.onBeforeCompile=e=>{e.uniforms.detailMap={value:t},e.uniforms.detailRepeat={value:a},r&&(e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec2 vGroundAt;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
  vGroundAt = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec2 vGroundAt;`).replace(`#include <clipping_planes_fragment>`,`#include <clipping_planes_fragment>\n  ${o}`)),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
uniform sampler2D detailMap;
uniform float detailRepeat;`).replace(`#include <map_fragment>`,`#include <map_fragment>
  // Blades and grain up close, calmer with distance (where they would only
  // shimmer); broader patches of lighter and darker, greener and drier
  // ground at the two coarser scales, which also hide the tile's repeat.
  float detailNear = 1.0 - smoothstep( 15.0, 260.0, length( vViewPosition ) );
  // Blades only where the map is grass or earth: paving is a grey of low
  // saturation (measured near enough to sRGB through a square root), and
  // streaked with blades it read as rippled water in the shade.
  vec3 srgbish = sqrt( max( diffuseColor.rgb, vec3( 0.0 ) ) );
  float hi = max( srgbish.r, max( srgbish.g, srgbish.b ) );
  float sat = ( hi - min( srgbish.r, min( srgbish.g, srgbish.b ) ) ) / ( hi + 0.001 );
  float soil = smoothstep( 0.17, 0.3, sat );
  vec3 blades = texture2D( detailMap, vMapUv * detailRepeat ).rgb * 2.0;
  // Paving: the same texture blurred and greyed, a mottle of wear and grit.
  float grit = dot( texture2D( detailMap, vMapUv * detailRepeat * 0.6 + 0.13, 1.5 ).rgb, vec3( 0.333 ) ) * 2.0;
  vec3 fine = mix( vec3( mix( 1.0, grit, 0.45 ) ), blades, soil );
  diffuseColor.rgb *= mix( vec3( 1.0 ), fine, 0.55 + 0.75 * detailNear );
  diffuseColor.rgb *= mix( 1.0, texture2D( detailMap, vMapUv * detailRepeat / 9.0 + 0.37 ).r * 2.0, 0.8 );
  float patchy = texture2D( detailMap, vMapUv * detailRepeat / 31.0 + 0.71 ).r * 2.0 - 1.0;
  diffuseColor.rgb *= vec3( 1.0 + 0.10 * patchy, 1.0 + 0.02 * patchy, 1.0 - 0.10 * patchy );`)},i.customProgramCacheKey=()=>r?`rs-ground-detail-3-holed`:`rs-ground-detail-3`,i}var Z={x1:-2560,x2:2560,y1:-2560,y2:2560},Oe=2.5;Math.round((Z.x2-Z.x1)/Oe),Math.round((Z.y2-Z.y1)/Oe);function ke(e){let t=W(e),n=[{x:0,y:.15,z:0,s:.68}];for(let e=0;e<5;e++){let r=e/5*Math.PI*2+(t()-.5)*.7,i=.42+t()*.12;n.push({x:Math.cos(r)*i,y:-.05+(t()-.3)*.35,z:Math.sin(r)*i,s:.46+t()*.14})}let r=[],i=[],a=[];for(let e of n){let n=new x(1,1);n.deleteAttribute(`uv`),n.deleteAttribute(`normal`);let o=ee(n);n.dispose();let s=o.getAttribute(`position`),c=r.length/3;for(let n=0;n<s.count;n++){let a=.84+t()*.3,o=s.getY(n),c=e.x+s.getX(n)*e.s*a,l=e.y+o*e.s*a*(o<0?.6:1),u=e.z+s.getZ(n)*e.s*a;r.push(c,l,u);let d=Math.min(1,Math.max(0,(l+.6)/1.4)),f=Math.min(1,Math.hypot(c,u)/.8),p=.42+.4*d+.18*f;i.push(p,p,p)}let l=o.getIndex();if(l)for(let e=0;e<l.count;e++)a.push(c+l.getX(e));o.dispose()}let o=new O;return o.setAttribute(`position`,new y(r,3)),o.setAttribute(`color`,new y(i,3)),o.setIndex(a),o.computeVertexNormals(),o}function Ae(){let e=new M({vertexColors:!0,roughness:.92});return e.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vLeaf;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
  vLeaf = position * 7.0;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vLeaf;
float leafHash( vec3 p ) {
  p = fract( p * 0.3183099 + 0.1 );
  p *= 17.0;
  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
}
float leafNoise( vec3 x ) {
  vec3 i = floor( x );
  vec3 f = fract( x );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( leafHash( i ), leafHash( i + vec3( 1, 0, 0 ) ), f.x ),
                   mix( leafHash( i + vec3( 0, 1, 0 ) ), leafHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( leafHash( i + vec3( 0, 0, 1 ) ), leafHash( i + vec3( 1, 0, 1 ) ), f.x ),
                   mix( leafHash( i + vec3( 0, 1, 1 ) ), leafHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`).replace(`#include <color_fragment>`,`#include <color_fragment>
  float leafA = leafNoise( vLeaf );
  float leafB = leafNoise( vLeaf * 2.7 + 11.0 );
  diffuseColor.rgb *= 0.62 + 0.55 * leafA * ( 0.6 + 0.4 * leafB );`).replace(`#include <normal_fragment_begin>`,`#include <normal_fragment_begin>
  normal = normalize( normal + 0.55 * ( vec3( leafNoise( vLeaf * 1.9 + 3.0 ), leafNoise( vLeaf * 1.9 + 7.0 ), leafNoise( vLeaf * 1.9 + 5.0 ) ) - 0.5 ) );`)},e.customProgramCacheKey=()=>`rs-country-foliage`,e}function je(){let e=[],t=[];for(let n=0;n<12;n++){let r=n/12*Math.PI*2+n%2*.2,i=n%3==0?.35:.1,a=Math.cos(r),o=Math.sin(r),s=(e,t)=>{let n=.11*Math.sin(Math.PI*Math.min(1,e*1.1)),r=i*e-.75*e*e;return[a*e-o*n*t,r,o*e+a*n*t]};for(let n=0;n<5;n++){let r=n/5,i=(n+1)/5,a=s(r,-1),o=s(r,1),c=s(i,-1),l=s(i,1);e.push(...a,...o,...l,...a,...l,...c);let u=.6+.4*r,d=.6+.4*i;t.push(u,u,u,u,u,u,d,d,d,u,u,u,d,d,d,d,d,d)}}let n=new O;return n.setAttribute(`position`,new y(e,3)),n.setAttribute(`color`,new y(t,3)),n.computeVertexNormals(),n}var Me=(Z.x2-Z.x1)/4;function Ne(e,t,n){let r=new Map;for(let e of n){let t=`${Math.floor(e.m.elements[12]/Me)},${Math.floor(e.m.elements[14]/Me)}`,n=r.get(t)??[];n.push(e),r.set(t,n)}return[...r.values()].map(n=>{let r=new b(e,t,n.length);return n.forEach((e,t)=>{r.setMatrixAt(t,e.m),r.setColorAt(t,e.c)}),r.computeBoundingSphere(),r})}function Pe(t,r){let i=[[62,86,40],[52,76,36],[74,94,46],[58,80,44],[84,98,52]],a=(t,n)=>{let r=i[Math.floor(t*i.length)%i.length]??[60,84,40],a=n*(.85+t*7.31%1*.3);return new T().setRGB(r[0]/255*a,r[1]/255*a,r[2]/255*a,e)},o=new d(0,1,0),s=new n,c=[],l=[],u=[],f=new T(`#4a3f33`);for(let e of t)if(s.setFromAxisAngle(o,e.turn),e.palm)l.push({m:new N().compose(new d(e.x,e.top/2,-e.y),s,new d(.4,e.top,.4)),c:f}),u.push({m:new N().compose(new d(e.x,e.top,-e.y),s,new d(e.w,e.w,e.w)),c:a(e.tone,1.05)});else{c.push({m:new N().compose(new d(e.x,e.top,-e.y),s,new d(e.w,e.h,e.w*(.8+e.tone*.4))),c:a(e.tone,1)});let t=.15*e.w;l.push({m:new N().compose(new d(e.x,e.top/2,-e.y),s,new d(t,e.top,t)),c:f})}let p=r(Ae()),m=r(new M({vertexColors:!0,roughness:.9,side:2})),h=r(ke(9605)),g=r(je()),_=r(new j(.4,.6,1,7,1,!0)),v=r(new M({roughness:1}));return[...Ne(h,p,c),...Ne(g,m,u),...Ne(_,v,l)]}var Fe=`
float msHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float msNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( msHash( i ), msHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( msHash( i + vec2( 0.0, 1.0 ) ), msHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
// A grid's lines: 1 on a joint, 0 off it, antialiased, and faded out once a
// cell is under a few pixels across.
float msJoint( vec2 cells, float width ) {
  vec2 w = fwidth( cells );
  vec2 d = min( fract( cells ), 1.0 - fract( cells ) );
  vec2 line = 1.0 - smoothstep( vec2( width ) - w * 0.5, vec2( width ) + w * 0.5, d );
  float fade = 1.0 - smoothstep( 0.12, 0.35, max( w.x, w.y ) );
  return max( line.x, line.y ) * fade;
}`;function Ie(e,t,n){let r=t===`brick`;return e.onBeforeCompile=e=>{e.uniforms.msTile={value:n.tile},e.uniforms.msGround={value:n.groundY},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vMsWorld;
varying vec3 vMsNormal;`).replace(`#include <project_vertex>`,`#include <project_vertex>
  vec4 msWorld = vec4( transformed, 1.0 );
  vec3 msNormal = objectNormal;
  #ifdef USE_INSTANCING
    msWorld = instanceMatrix * msWorld;
    msNormal = mat3( instanceMatrix ) * msNormal;
  #endif
  vMsWorld = ( modelMatrix * msWorld ).xyz;
  vMsNormal = mat3( modelMatrix ) * msNormal;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\nvarying vec3 vMsWorld;\nvarying vec3 vMsNormal;\nuniform float msTile;\nuniform float msGround;\n${Fe}`).replace(`#include <map_fragment>`,`#include <map_fragment>
  {
    vec3 n = normalize( vMsNormal );
    vec3 p = vMsWorld;
    float level = smoothstep( 0.65, 0.9, abs( n.y ) );
    // Along a wall: its horizontal run, whichever way the wall faces.
    vec2 runDir = normalize( vec2( -n.z, n.x ) + vec2( 1e-4 ) );
    float run = dot( p.xz, runDir );
    float k = 1.0;
    // ── Walls ──
    float wall = 1.0 - level;
    if ( wall > 0.0 ) {
      float w = 1.0;
      ${r?`// Stretcher bond: each course shifted half a brick.
      vec2 b = vec2( run / 0.25, p.y / 0.075 );
      float row = floor( b.y );
      b.x += 0.5 * mod( row, 2.0 );
      float fade = 1.0 - smoothstep( 0.15, 0.45, fwidth( b.y ) );
      w *= mix( 1.0, 0.9 + 0.2 * msHash( vec2( floor( b.x ), row ) ), fade );
      w *= 1.0 + 0.16 * msJoint( b, 0.08 );`:``}
      // Broad clean and dirty stretches.
      w *= 0.94 + 0.12 * msNoise( vec2( run, p.y * 0.6 ) / 4.0 );
      // Rain streaks: narrow, a few metres apart, long.
      float streak = smoothstep( 0.55, 0.85, msNoise( vec2( run * 1.4, p.y * 0.05 ) ) ) * smoothstep( 0.3, 0.7, msNoise( vec2( run * 0.3, p.y * 0.25 + 7.0 ) ) );
      w *= 1.0 - 0.13 * streak;
      // The damp foot.
      w *= 1.0 - 0.14 * ( 1.0 - smoothstep( 0.0, 0.7, p.y - msGround ) );
      k = mix( k, w, wall );
    }
    // ── Paving ──
    if ( level > 0.0 ) {
      vec2 t = p.xz / msTile;
      float fade = 1.0 - smoothstep( 0.15, 0.45, max( fwidth( t.x ), fwidth( t.y ) ) );
      float f = mix( 1.0, 0.93 + 0.14 * msHash( floor( t ) ), fade );
      f *= 1.0 - 0.26 * msJoint( t, 0.03 );
      // Laid in bays ten slabs square, each a pour or a batch of its own,
      // with a wider movement joint between: still there from far off.
      vec2 bay = t / 10.0;
      f *= 0.95 + 0.1 * msHash( floor( bay ) + 17.0 );
      f *= 1.0 - 0.3 * msJoint( bay, 0.012 );
      // Stains a few metres across, broad weathering, and a finer grit.
      f *= 0.9 + 0.16 * msNoise( p.xz / 5.0 );
      f *= 0.9 + 0.16 * msNoise( p.xz / 17.0 + 3.0 );
      f *= 0.97 + 0.06 * msNoise( p.xz * 1.7 );
      k = mix( k, f, level );
    }
    diffuseColor.rgb *= k;
  }`)},e.customProgramCacheKey=()=>`model-surface-${t}-${n.tile}`,e.needsUpdate=!0,e}var Le=.8,Re=e=>e[0],ze=e=>-e[1];function Be(e){return ue(e)<0?[...e].reverse():[...e]}function Ve(e,t,n,r,i=0,a=!1,o=0){let s=Be(e),c=[],l=[],u=[],d=o;for(let e=0;e<s.length;e++){let o=U(s,e),f=U(s,e+1),p=f[0]-o[0],m=f[1]-o[1],h=Math.hypot(p,m);if(h<.05)continue;let g=m/h*i,_=-p/h*i,v=c.length/3,y=[o[0]+g,o[1]+_],b=[f[0]+g,f[1]+_];c.push(Re(y),t,ze(y),Re(b),t,ze(b),Re(b),n,ze(b),Re(y),n,ze(y));let x=d/4,S=(d+h)/4;l.push(x,t/r,S,t/r,S,n/r,x,n/r),a?u.push(v,v+2,v+1,v,v+3,v+2):u.push(v,v+1,v+2,v,v+2,v+3),d+=h}let f=new O;return f.setAttribute(`position`,new y(c,3)),f.setAttribute(`uv`,new y(l,2)),f.setIndex(u),f.computeVertexNormals(),f}function He(e,t){let n=new c(Be(e).map(e=>new o(e[0],e[1]))),r=new u(n);return r.rotateX(-Math.PI/2),r.translate(0,t,0),r}function Ue(e,t=0){let n=e.angle*Math.PI/180,r=Math.cos(n),i=Math.sin(n),a=e.length/2+t,o=e.width/2+t;return[[e.cx-a*r+o*i,e.cy-a*i-o*r],[e.cx+a*r+o*i,e.cy+a*i-o*r],[e.cx+a*r-o*i,e.cy+a*i+o*r],[e.cx-a*r-o*i,e.cy-a*i+o*r]]}var Q=(e,t)=>new d(Re(e),t,ze(e));function We(e,t){let n=[],r=[],i=new d(0,1,0);for(let[a,o,s]of e){let e=new d().subVectors(o,a).cross(new d().subVectors(s,a)).normalize();e.y<0&&e.negate();let c=new d().crossVectors(i,e);c.lengthSq()<1e-6&&c.set(1,0,0),c.normalize();let l=new d().crossVectors(e,c).normalize();for(let e of[a,o,s])n.push(e.x,e.y,e.z),r.push(e.dot(c)/t,e.dot(l)/t)}let a=new O;return a.setAttribute(`position`,new y(n,3)),a.setAttribute(`uv`,new y(r,2)),a.computeVertexNormals(),a}function Ge(e,t,n){let r=Le*.6,[i,a,o,s]=Ue(e,r).map(e=>Q(e,t)),c=e.angle*Math.PI/180,l=e.length/2+r,u=Q([e.cx-l*Math.cos(c),e.cy-l*Math.sin(c)],t+n),d=Q([e.cx+l*Math.cos(c),e.cy+l*Math.sin(c)],t+n),f=We([[i,a,d],[i,d,u],[o,s,u],[o,u,d]],1),[p,m,h,g]=Ue(e,0).map(e=>Q(e,t)),_=e.length/2,v=Q([e.cx-_*Math.cos(c),e.cy-_*Math.sin(c)],t+n*(1-r/(e.width/2+r)));return{roof:f,gables:We([[m,h,Q([e.cx+_*Math.cos(c),e.cy+_*Math.sin(c)],t+n*(1-r/(e.width/2+r)))],[g,p,v]],4)}}function Ke(e){return e.onBeforeCompile=e=>{e.fragmentShader=e.fragmentShader.replace(`#include <map_fragment>`,`#include <map_fragment>
  vec3 slabMean = texture2D( map, vMapUv, 12.0 ).rgb + 0.001;
  // From a well-blurred level: magnified, the tile's hairline cracks would
  // turn into dark rivers and rings across the roof; blurred, only the
  // stains survive.
  vec3 broad = texture2D( map, vMapUv * 0.19 + 0.21, 5.0 ).rgb / slabMean;
  vec3 broader = texture2D( map, vMapUv * 0.067 + 0.53, 5.5 ).rgb / slabMean;
  float damp = clamp( dot( broad * broader, vec3( 0.333 ) ), 0.4, 1.6 );
  diffuseColor.rgb *= mix( 1.0, damp, 1.3 );
  float mould = 1.0 - smoothstep( 0.7, 0.88, damp );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.55, 0.6, 0.52 ), mould );`)},e.customProgramCacheKey=()=>`rs-weathered-slab`,e}var qe=`
float rsHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float rsNoise( float x ) {
  float i = floor( x );
  float f = fract( x );
  return mix( rsHash( vec2( i, 0.0 ) ), rsHash( vec2( i + 1.0, 0.0 ) ), f * f * ( 3.0 - 2.0 * f ) );
}
float rsNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( rsHash( i ), rsHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( rsHash( i + vec2( 0.0, 1.0 ) ), rsHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}`;function Je(e,t){return e.onBeforeCompile=e=>{e.uniforms.metresPerU={value:t},e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying float vWallHeight;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
  vWallHeight = ( modelMatrix * vec4( transformed, 1.0 ) ).y;`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>\nvarying float vWallHeight;\nuniform float metresPerU;\n${qe}`).replace(`#include <map_fragment>`,`#include <map_fragment>
  float along = vMapUv.x * metresPerU;
  // Streaks: narrow, a few metres apart, each fading in and out over several
  // storeys; gathered in some stretches of wall more than others.
  float streak = pow( rsNoise( along * 1.7 ), 5.0 ) * smoothstep( 0.25, 0.7, rsNoise( along * 0.21 + 3.1 ) );
  streak *= 0.35 + 0.65 * rsNoise( vec2( along * 0.9, vWallHeight * 0.09 ) );
  // Broad stretches cleaner or dirtier, a few repaints apart.
  float wash = 0.93 + 0.1 * rsNoise( along * 0.06 + 7.3 );
  // Damp at the foot, with a ragged top edge.
  float damp = 1.0 - smoothstep( 0.5, 1.4 + 0.6 * rsNoise( along * 1.3 ), vWallHeight );
  diffuseColor.rgb *= wash * ( 1.0 - 0.42 * streak );
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.62, 0.66, 0.6 ), damp * 0.8 );`)},e.customProgramCacheKey=()=>`rs-grimed-wall`,e}[`#1b2126`,`#1b2126`,`#1b2126`,`#1b2126`,`#20282e`,`#20282e`,`#3e342c`,`#323c48`,`#4a2e2e`,`#58534a`,`#2f4031`,`#7d7a70`].map(e=>new T(e)),new T(`#2ecc71`).multiplyScalar(.06);var Ye=[[214,208,194],[222,204,166],[226,206,140],[170,196,206],[178,204,180],[216,172,152],[170,168,160]],Xe=[0,0,0,0,1,1,1,6,6,6,2,5];function Ze(e,t){let n=W(7700+t),r=n();if(e<70)return{kind:`hut`,storeys:1,walls:r<.55?`tin`:r<.85?`brick`:Math.floor(n()*(Ye.length-1)),roof:n()<.55?`tin-silver`:n()<.75?`tin-rust`:`tin-blue`,tank:!1,stairHead:!1,stubs:!1};if(e>1200)return{kind:`shed`,storeys:1,walls:Ye.length-1,roof:r<.6?`sheet-pale`:`sheet-blue`,tank:!1,stairHead:!1,stubs:!1};let i=e<150?2:e<400?4:6,a=1+Math.floor(n()*i),o=n()<.2?`brick`:Math.floor(n()*Ye.length);return a===1&&n()<.3?{kind:`house`,storeys:a,walls:o,roof:n()<.6?`tin-silver`:`tin-rust`,tank:!1,stairHead:!1,stubs:!1}:{kind:`house`,storeys:a,walls:o,roof:`flat`,tank:n()<.7,stairHead:a>=2&&n()<.75,stubs:a>=2&&n()<.18}}function Qe(e,t,n){let r=W(7900+n);if(t<=1&&e<60)return{kind:`hut`,storeys:1,walls:r()<.5?`tin`:`brick`,roof:r()<.6?`tin-silver`:`tin-rust`,tank:!1,stairHead:!1,stubs:!1};let i=r();return{kind:`house`,storeys:Math.max(1,Math.round(t)),walls:i<.12?`brick`:Xe[Math.floor(r()*Xe.length)]??0,roof:`flat`,tank:r()<.8,stairHead:t>=2&&r()<.85,stubs:t>=2&&t<=5&&r()<.12}}function $e(e){let t={cx:0,cy:0,length:0,width:0,angle:0},n=1/0;for(let r=0;r<e.length;r++){let i=e[r],a=e[(r+1)%e.length];if(!i||!a)continue;let o=Math.atan2(a[1]-i[1],a[0]-i[0]),s=Math.cos(o),c=Math.sin(o),l=1/0,u=-1/0,d=1/0,f=-1/0;for(let t of e){let e=t[0]*s+t[1]*c,n=-t[0]*c+t[1]*s;l=Math.min(l,e),u=Math.max(u,e),d=Math.min(d,n),f=Math.max(f,n)}let p=(u-l)*(f-d);if(p<n){n=p;let e=(l+u)/2,r=(d+f)/2,i=e*s-r*c,a=e*c+r*s,m=u-l>=f-d;t={cx:i,cy:a,length:m?u-l:f-d,width:m?f-d:u-l,angle:(m?o:o+Math.PI/2)*180/Math.PI}}}return t}function et(e){let t=$e(e);return Math.abs(ue(e))>=.9*t.length*t.width}var tt=[[1,1,1],[1,1,1],[1.12,1.1,1.06],[1.12,1.1,1.06],[.78,.76,.72],[.86,.85,.82],[1.05,.7,.58],[.86,.98,.88]],nt=[`#1b1d1f`,`#1b1d1f`,`#1b1d1f`,`#24476b`,`#2f5f8f`,`#d9d6cb`],rt=[`#9a9d9e`,`#8c9092`,`#a7a59d`,`#4d6f8f`,`#4f7a5a`,`#8f3b31`],it=[`#d23a2e`,`#1f8a4c`,`#1f5fa8`,`#f0c02a`,`#f4f2ea`,`#e2712b`,`#b0306a`,`#2a9bb0`];function at(t,r,i=null){let a=[],o=e=>(a.push(e),e),s=new E,c=ye(711),l=Se(Ye,712,c.map,i?xe:be);o(c.map),c.normalMap&&o(c.normalMap),l.normalMap&&o(l.normalMap);let u=e=>{o(e),e.repeat.set(4/3,1);let t=Je(new M({map:e,roughness:.95}),3);return l.normalMap&&(t.normalMap=l.normalMap),o(t)},p=l.maps.map(u),m=l.brickMap?u(l.brickMap):o(new M({color:`#8f4f3a`,roughness:.95})),g=(e,t,n)=>{let r=he(e,t);o(r.map),r.normalMap&&o(r.normalMap),n&&(r.map.repeat.set(4,1),r.normalMap?.repeat.set(4,1));let i=new M({map:r.map,roughness:.55,metalness:.45,side:2});return r.normalMap&&(i.normalMap=r.normalMap),o(i)},_={"tin-silver":g([172,176,174],721,!1),"tin-rust":g([142,92,64],722,!1),"tin-blue":g([104,126,140],723,!1),"sheet-pale":g([200,202,198],724,!1),"sheet-blue":g([84,116,146],725,!1)},v=g([150,148,140],726,!0),S=ve(727,150);o(S.map),S.normalMap&&o(S.normalMap),S.map.repeat.set(1/8,1/8),S.normalMap?.repeat.set(1/8,1/8);let C=o(Ke(new M({map:S.map,roughness:.95})));S.normalMap&&(C.normalMap=S.normalMap);let w=o(new M({color:`#a9a69c`,roughness:.95})),O=o(new M({color:`#ffffff`,roughness:.5})),k=o(new M({color:`#8d8a82`,roughness:.9}));C.vertexColors=!0;let ee=new Map,A=(e,t)=>{let n=ee.get(e)??[];n.push(t.index?t.toNonIndexed():t),t.index&&t.dispose(),ee.set(e,n)},te=[],ne=new T(`#1b1d1f`),P=[],F=[],re=[[],[],[]],I=[],ie=[],L=[],R=[],z=new d(0,1,0);function B(t,n,r,i,a){let o=n.walls===`brick`?[150,92,70]:Ye[typeof n.walls==`number`?n.walls:0]??[214,208,194],s=new T().setRGB(Math.min(1,o[0]/255*1.06),Math.min(1,o[1]/255*1.06),Math.min(1,o[2]/255*1.06),e),c=t.length,l=t.width,u=(e,t,n,a,o,c)=>{let l=r(e,t);l.y=n,R.push({m:new N().compose(l,i,new d(a,o,c)),c:s})},f=a(),p=f<.3?0:.35+.6*f,m=Math.max(1,Math.floor(c/3.4));for(let e=1;e<n.storeys;e++){let t=e*3.1;u(0,l/2+.2,t,c+.8,.16,.45),u(0,-(l/2+.2),t,c+.8,.16,.45),u(c/2+.2,0,t,.45,.16,l+.8),u(-(c/2+.2),0,t,.45,.16,l+.8);for(let e of[1,-1])for(let n=0;n<m;n++){if(a()>=p)continue;let r=-c/2+(n+.5)*c/m,i=Math.min(2.8,c/m-.4);u(r,e*(l/2+.55),t+.06,i,.14,1.1),u(r,e*(l/2+1.06),t+.56,i,1,.1)}}}function ae(e,t,n,r,i){let a=e.length,o=e.width,s=[{u:0,v:o/2,len:a,long:!0,out:1},{u:0,v:-o/2,len:a,long:!0,out:-1},{u:a/2,v:0,len:o,long:!1,out:1},{u:-a/2,v:0,len:o,long:!1,out:-1}];for(let e of s){if(e.len<4)continue;let a=e.long?t(e.u,e.v+e.out*2):t(e.u+e.out*2,e.v);if(!i([a.x,-a.z],6))continue;let o=Math.max(1,Math.floor(e.len/3.2)),s=e.len/o,c=s-.4,l=0;for(let i=0;i<o;i++){let a=-e.len/2+(i+.5)*s,u=n=>e.long?t(a,e.v+e.out*n):t(e.u+e.out*n,a),f=(t,r,i,a,o)=>{let s=u(t);return s.y=r,new N().compose(s,n,e.long?new d(i,a,o):new d(o,a,i))};if(r()<.55)F.push(f(.03,1.1,c,2.2,.08));else{let e=new T(rt[Math.floor(r()*rt.length)]??`#9a9d9e`);P.push({m:f(.05,1.1,c,2.2,.08),c:e})}if(l>0){l--;continue}if(r()<.12)continue;let p=i+1<o&&r()<.3?2:1;l=p-1;let m=p*s-.3,h=(p-1)*s*.5,g=e.long?t(a+h,e.v+e.out*.18):t(e.u+e.out*.18,a+h);g.y=2.55+r()*.06;let _=new N().compose(g,n,e.long?new d(m,.78,.06):new d(.06,.78,m)),v=new T(it[Math.floor(r()*it.length)]??`#d23a2e`);re[Math.floor(r()*re.length)]?.push({m:_,c:v})}}}t.forEach((t,a)=>{let o=Math.abs(ue(t));if(o<8)return;let s=r?.[a]??Ze(o,a),c=W(7800+a),l=$e(t),u=s.walls===`tin`?v:s.walls===`brick`?m:p[s.walls]??w;if(s.roof!==`flat`){let e=s.kind===`shed`?7+c()*2:s.kind===`hut`?2.5+c()*.4:3.1,n=s.walls===`tin`?1:3.1;if(!et(t)){A(u,Ve(t,0,e,n)),A(_[s.roof],He(t,e));return}let r=Math.min(s.kind===`shed`?4:2.2,l.width*(s.kind===`shed`?.12:.28));A(u,Ve(Ue(l,0),0,e,n));let{roof:i,gables:a}=Ge(l,e,r);A(_[s.roof],i),A(s.walls===`tin`?v:_[s.roof],a);return}let f=s.storeys*3.1;A(u,Ve(t,0,f,3.1,0,!1,i?c()*60:0));let h=He(t,f),g=i?tt[Math.floor(W(5100+a)()*tt.length)]??[1,1,1]:[1,1,1],b=h.getAttribute(`position`).count,x=new Float32Array(b*3);for(let e=0;e<b;e++)x.set(g,e*3);h.setAttribute(`color`,new y(x,3)),A(C,h),A(w,Ve(t,f,f+.9,3.1)),A(w,Ve(t,f,f+.9,3.1,-.15,!0));let S=l.angle*Math.PI/180,E=new n().setFromAxisAngle(z,S),D=(e,t)=>new d(l.cx+Math.cos(S)*e-Math.sin(S)*t,0,-(l.cy+Math.sin(S)*e+Math.cos(S)*t)),O=i!==null&&et(t)&&Math.hypot(l.cx,l.cy)<=i.detailRadius;if(O&&s.storeys>=3&&B(l,s,D,E,c),O&&i?.street&&s.storeys>=2&&ae(l,D,E,W(6100+a),i.street),s.stairHead){let e=D(l.length*(c()-.5)*.5,l.width*(c()-.5)*.4);e.y=f+1.3,ie.push(new N().compose(e,E,new d(3,2.6,3.2)))}if(s.tank){let e=D(l.length*(c()-.5)*.6,l.width*(c()-.5)*.5);e.y=f+(s.stairHead?2.6:0)+.8,te.push({m:new N().compose(e,E,new d(1,1,1)),c:ne})}if(i){let n=W(5300+a),r=l.length*l.width>120?Math.floor(n()*3):0;for(let e=0;e<r;e++){let e=D(l.length*(n()-.5)*.7,l.width*(n()-.5)*.6);e.y=f+.8;let t=new T(nt[Math.floor(n()*nt.length)]??`#1b1d1f`),r=.8+n()*.4;te.push({m:new N().compose(e,E,new d(r,1,r)),c:t})}if(s.storeys>=3&&et(t)&&n()<.3){let t=3+Math.floor(n()*6),r=n()<.5?1:-1;for(let i=0;i<t;i++){let a=D(-l.length/2+1+(i+.5)*(l.length-2)/t,r*(l.width/2-.8)),o=.5+n()*.5;a.y=f+o*.5;let s=new T().setHSL(.22+n()*.1,.45,.22+n()*.12,e);I.push({m:new N().compose(a,E,new d(o,o,o)),c:s})}}}if(s.stubs)for(let[e,t]of[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5],[0,-.5],[0,.5]]){let n=D(e*(l.length-.6),t*(l.width-.6));n.y=f+.6,L.push(new N().compose(n,E,new d(.3,1.2,.3)))}});for(let[e,t]of ee){let n=D(t);for(let e of t)e.dispose();if(!n)continue;n.computeVertexNormals();let r=new f(o(n),e);r.castShadow=r.receiveShadow=!0,s.add(r)}let V=o(new h(1,1,1)),oe=o(new j(.7,.7,1.6,14)),H=(e,t,n)=>{if(n.length===0)return;let r=new b(e,t,n.length);n.forEach((e,t)=>r.setMatrixAt(t,e)),r.castShadow=r.receiveShadow=!0,r.computeBoundingSphere(),s.add(r)},se=(e,t,n,r=!0)=>{if(n.length===0)return;let i=new b(e,t,n.length);n.forEach((e,t)=>{i.setMatrixAt(t,e.m),i.setColorAt(t,e.c)}),i.castShadow=r,i.receiveShadow=!0,i.computeBoundingSphere(),s.add(i)};if(se(oe,O,te),P.length+F.length>0){let e=o(ge(731));se(V,o(new M({map:e,roughness:.5,metalness:.35})),P,!1),H(V,o(new M({color:`#221e1a`,roughness:.9})),F)}if(re.forEach((e,t)=>{if(e.length===0)return;let n=o(_e(741+t));se(V,o(new M({map:n,roughness:.55})),e,!1)}),I.length>0&&se(o(new x(.55,0)),o(new M({roughness:.9,flatShading:!0})),I),R.length>0){let e=o(new M({roughness:.92})),t=new b(V,e,R.length);R.forEach((e,n)=>{t.setMatrixAt(n,e.m),t.setColorAt(n,e.c)}),t.castShadow=t.receiveShadow=!0,t.computeBoundingSphere(),s.add(t)}return H(V,w,ie),H(V,k,L),{group:s,dispose(){for(let e of a)e.dispose()}}}var ot=`#bcc6cc`;function st(e,n,r){let i=new P;i.scale.setScalar(r.skyScale);let a=i.material.uniforms;a.turbidity&&(a.turbidity.value=7),a.rayleigh&&(a.rayleigh.value=1.4),a.mieCoefficient&&(a.mieCoefficient.value=.006),a.mieDirectionalG&&(a.mieDirectionalG.value=.8),a.sunPosition&&a.sunPosition.value.copy(r.sunDirection),e.add(i);let o=new S(n),s=new C,c=new P;c.scale.setScalar(6e3);for(let e of Object.keys(a)){let t=a[e],n=c.material.uniforms[e];t&&n&&(n.value=t.value)}let l=c.material.uniforms.showSunDisc;l&&(l.value=0),s.add(c);let u=new _(5e3,24),d=new t({color:new T(.45,.41,.36)}),p=new f(u,d);p.rotation.x=-Math.PI/2,p.position.y=-5,s.add(p);let m=o.fromScene(s,0,1,2e4);return c.geometry.dispose(),c.material.dispose(),u.dispose(),d.dispose(),o.dispose(),e.environment=m.texture,e.environmentIntensity=r.environment??.08,e.fog=new k(ot,r.hazeFrom,r.hazeTo),{dispose(){e.remove(i),i.geometry.dispose(),i.material.dispose(),m.texture.dispose(),e.environment===m.texture&&(e.environment=null),e.fog=null}}}var ct=[`#d6d0c2`,`#ded0b0`,`#cfc7b8`,`#bfc4c2`,`#d8c4ae`,`#c9c4b8`,`#b7b2a6`,`#e0dbd0`];function lt(e,t,n){let r=document.createElement(`canvas`);r.width=r.height=n;let i=r.getContext(`2d`);if(!i)return r;let a=2*t/n,o=e=>[(e[0]+t)/a,(t-e[1])/a],s=e=>e/a,c=e=>{i.beginPath(),e.forEach((e,t)=>{let[n,r]=o(e);t===0?i.moveTo(n,r):i.lineTo(n,r)}),i.closePath()},l=e=>{i.beginPath(),e.forEach((e,t)=>{let[n,r]=o(e);t===0?i.moveTo(n,r):i.lineTo(n,r)})},u=document.createElement(`canvas`);u.width=u.height=512;let d=u.getContext(`2d`);if(d){let e=d.createImageData(512,512);for(let t=0;t<512;t++)for(let n=0;n<512;n++){let r=K(n/512,t/512,24,4,611),i=(t*512+n)*4,a=.86+.28*r;e.data[i]=146*a,e.data[i+1]=138*a,e.data[i+2]=122*a,e.data[i+3]=255}d.putImageData(e,0,0),i.imageSmoothingEnabled=!0,i.drawImage(u,0,0,n,n)}i.lineJoin=`round`,i.fillStyle=i.strokeStyle=`#a7a194`,i.lineWidth=s(7);for(let t of e.buildings)c(t.outline),i.fill(),i.stroke();e.plot&&(c(e.plot),i.fillStyle=`#aca698`,i.fill());for(let t of e.green)c(t.outline),i.fillStyle=t.kind===`pitch`?`#6b8a42`:`#5c7838`,i.fill();i.fillStyle=`#3f5658`;for(let t of e.water)c(t),i.fill();i.lineCap=`round`;let f=[...e.roads].sort((e,t)=>e.width-t.width);for(let e of f)e.kind.startsWith(`water-`)||(l(e.path),i.strokeStyle=e.width>=6?`#b3ada0`:`#9d978a`,i.lineWidth=s(e.width+(e.width>=6?3.5:1)),i.stroke());for(let e of f)l(e.path),i.strokeStyle=e.kind.startsWith(`water-`)?`#3f5658`:e.width>=6?`#47484b`:`#6e6a63`,i.lineWidth=s(e.width),i.stroke();i.setLineDash([s(3),s(6)]),i.strokeStyle=`rgba(225,221,208,0.75)`,i.lineWidth=Math.max(1,s(.18));for(let e of f)e.width<10||e.kind.startsWith(`water-`)||(l(e.path),i.stroke());i.setLineDash([]);let p=document.createElement(`canvas`);p.width=p.height=n;let m=p.getContext(`2d`);if(m){m.fillStyle=`rgb(40,34,26)`;for(let t of e.buildings)m.beginPath(),t.outline.forEach((e,t)=>{let[n,r]=o(e);t===0?m.moveTo(n,r):m.lineTo(n,r)}),m.closePath(),m.fill();i.save(),i.filter=`blur(${Math.max(1,s(1.6))}px)`,i.globalAlpha=.55,i.drawImage(p,0,0),i.restore()}return r}function ut(e,t,n){let r=document.createElement(`canvas`);r.width=r.height=n;let i=r.getContext(`2d`);if(!i)return r;let a=2*t/n;i.fillStyle=`#5f5d58`,i.fillRect(0,0,n,n);for(let n of e)i.save(),i.translate((n.x+t)/a,(t-n.y)/a),i.rotate(-n.turn),i.fillStyle=n.tone<.5?`#8a8476`:`#958f81`,i.fillRect((-n.length/2-2)/a,(-n.width/2-2)/a,(n.length+4)/a,(n.width+4)/a),i.restore();return r}function dt(t){let n=new A(t);return n.colorSpace=e,n.anisotropy=8,n.minFilter=g,n.magFilter=ne,n}function ft(){let e=new M({roughness:.92});return e.onBeforeCompile=e=>{e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
varying vec3 vFarLocal;
varying vec3 vFarNormal;
varying vec3 vFarSize;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
  vFarLocal = position;
  vFarNormal = normal;
  vFarSize = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );`),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
varying vec3 vFarLocal;
varying vec3 vFarNormal;
varying vec3 vFarSize;`).replace(`#include <color_fragment>`,`#include <color_fragment>
  if ( abs( vFarNormal.y ) > 0.5 ) {
    // A flat roof: grey concrete, darker than the walls.
    diffuseColor.rgb = vec3( 0.36, 0.35, 0.33 );
  } else {
    float along = abs( vFarNormal.x ) > 0.5 ? ( vFarLocal.z + 0.5 ) * vFarSize.z : ( vFarLocal.x + 0.5 ) * vFarSize.x;
    float up = ( vFarLocal.y + 0.5 ) * vFarSize.y;
    float bay = fract( along / 3.0 );
    float storey = fract( up / 3.1 );
    float pane = step( 0.22, bay ) * step( bay, 0.78 ) * step( 0.3, storey ) * step( storey, 0.78 );
    float shop = 1.0 - step( 3.1, up );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.09, 0.1, 0.11 ), pane * ( 1.0 - shop ) * 0.85 );
    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.2, 0.19, 0.18 ), shop * 0.7 );
    // Grime gathers toward the foot of the wall.
    diffuseColor.rgb *= 0.8 + 0.2 * smoothstep( 0.0, 12.0, up );
  }`)},e.customProgramCacheKey=()=>`city-far-block`,e}function pt(e){let t=e.map(({size:e,at:t,shade:n})=>{let r=new h(...e).translate(...t);r.deleteAttribute(`uv`);let i=r.getAttribute(`position`).count;return r.setAttribute(`color`,new y(Array(i*3).fill(n),3)),r}),n=D(t)??new h(1,1,1);for(let e of t)e.dispose();return n}function mt(e){switch(e){case`car`:return pt([{size:[4.3,.75,1.75],at:[0,.6,0],shade:1},{size:[2.3,.6,1.6],at:[-.25,1.27,0],shade:.28},{size:[3.6,.32,1.8],at:[0,.18,0],shade:.12}]);case`cng`:return pt([{size:[2.6,1.05,1.3],at:[0,.95,0],shade:1},{size:[2.4,.1,1.38],at:[-.05,1.53,0],shade:.2},{size:[2.2,.35,1.3],at:[0,.22,0],shade:.12}]);case`rickshaw`:return pt([{size:[1.1,.5,1.05],at:[-.3,.75,0],shade:.5},{size:[1,.75,1.15],at:[-.35,1.45,0],shade:1},{size:[1,.25,.25],at:[.55,.55,0],shade:.25},{size:[1.9,.5,1.1],at:[0,.3,0],shade:.12}]);case`bus`:return pt([{size:[10.5,2.3,2.5],at:[0,1.65,0],shade:1},{size:[10.55,.85,2.53],at:[0,2.15,0],shade:.22},{size:[9.4,.55,2.52],at:[0,.32,0],shade:.12}])}}function ht(e,t){let n=e=>new T(e[Math.floor(t*e.length)%e.length]??e[0]??`#cccccc`);switch(e){case`car`:return n([`#e9e9e6`,`#e9e9e6`,`#e9e9e6`,`#b9bcbf`,`#b9bcbf`,`#1c1d20`,`#1c1d20`,`#6d7176`,`#8a1f22`,`#23406b`]);case`cng`:return n([`#2f7a3c`,`#2f7a3c`,`#2f7a3c`,`#3c8a46`]);case`rickshaw`:return n([`#2a4f9a`,`#b8312f`,`#d8a420`,`#2f8f5b`,`#6a2d84`]);case`bus`:return n([`#b42a28`,`#2b6c3a`,`#2b4f8c`,`#d4c9a8`])}}function gt(){return pt([{size:[.24,9,.24],at:[0,4.5,0],shade:1},{size:[.12,.12,1.5],at:[0,8.35,0],shade:.8}])}function _t(e,t,n,r){let i=[];for(let[a,o]of t){let t=e[a],s=e[o];if(!t||!s)continue;let c=Math.hypot(s.x-t.x,s.y-t.y);if(c<1)continue;let l=-(s.y-t.y)/c,u=(s.x-t.x)/c,d=[{off:-.65,h:8.35,sag:.35},{off:0,h:8.35,sag:.4},{off:.65,h:8.35,sag:.35}],f=Math.floor(r()*4);for(let e=0;e<f;e++)d.push({off:(r()-.5)*.8,h:7.2+r()*1,sag:.6+r()*1.4});for(let e of d){let r=e.sag*(c/30),a=t.x+l*e.off,o=t.y+u*e.off,d=e.h;for(let c=1;c<=8;c++){let f=c/8,p=t.x+(s.x-t.x)*f+l*e.off,m=t.y+(s.y-t.y)*f+u*e.off,h=e.h-r*4*f*(1-f);i.push(a,n+d,-o,p,n+h,-m),a=p,o=m,d=h}}}let a=new O;return a.setAttribute(`position`,new y(i,3)),a}function vt(e,t,n,r){let i=new Map;for(let e of n){let t=`${Math.floor(e.m.elements[12]/r)},${Math.floor(e.m.elements[14]/r)}`,n=i.get(t)??[];n.push(e),i.set(t,n)}return[...i.values()].map(n=>{let r=new b(e,t,n.length);return n.forEach((e,t)=>{r.setMatrixAt(t,e.m),r.setColorAt(t,e.c)}),r.computeBoundingSphere(),r})}function $(){return new Promise(e=>requestAnimationFrame(()=>e()))}async function yt(e){let t=[],i=e=>(t.push(e),e),a=new E,s=[],{data:l,site:g,extent:_,groundY:v}=e,y=e.light?e.farOuter*.7:e.farOuter,x=i(Te(613)),S=i(dt(lt(l,_,e.light?1536:2048))),C=e.cut??g,w={x1:C.x1-3,x2:C.x2+3,y1:C.y1-3,y2:C.y2+3},D=new f(i(new r(2*_,2*_)),i(De(S,x,2*_,w)));D.rotation.x=-Math.PI/2,D.position.y=v,D.receiveShadow=!0,a.add(D),s.push(D),await $();let O=oe(e.mappedRadius+8,y,e.light?2:1),k=y*1.25,ee=i(dt(ut(O,k,1024))),A={x1:-_,x2:_,y1:-_,y2:_},j=new f(i(new r(2*k,2*k)),i(De(ee,x,2*k,A)));j.rotation.x=-Math.PI/2,j.position.y=v-.05,a.add(j),s.push(j),await $();let ne=i(new M({color:`#2f4446`,roughness:.12,metalness:0}));for(let e of l.water){let t=new c(e.map(e=>new o(e[0],e[1]))),n=i(new u(t)),r=new f(n,ne);r.rotation.x=-Math.PI/2,r.position.y=v+.04,r.receiveShadow=!0,a.add(r),s.push(r)}if(l.plot&&l.plot.length>=3){let e=new c(l.plot.map(e=>new o(e[0],e[1])));e.holes.push(new p([new o(C.x1,C.y1),new o(C.x2,C.y1),new o(C.x2,C.y2),new o(C.x1,C.y2)]));let t=i(Ie(new M({color:`#aca698`,roughness:.92}),`masonry`,{tile:1,groundY:v})),n=new f(i(new u(e)),t);n.rotation.x=-Math.PI/2,n.position.y=v+.02,n.receiveShadow=!0,a.add(n),s.push(n)}await $();let P=l.buildings.map(e=>e.outline),I=at(P,l.buildings.map((e,t)=>{let n=Math.abs(re(e.outline));return Qe(n,ie(n,e.levels,t),t)}),{detailRadius:e.light?0:300,street:le(l)});t.push(I),I.group.position.y=v,a.add(I.group),await $();let L=F(4400),R=ae(l,g,e.light?2:1).map(e=>{let t=L()<.08,n=t?3.2+L()*1.2:2+L()*2.2;return{x:e[0],y:e[1],palm:t,w:n,h:n*(.75+L()*.2),top:t?8+L()*4:3.5+n*1.1+L()*1.5,turn:L()*Math.PI*2,tone:L()}});for(let e of Pe(R,i))e.castShadow=!0,e.position.y=v,a.add(e);await $(),await $();let z=se(l,g,e.light?2:1),B=i(new M({vertexColors:!0,roughness:.45,metalness:.25})),V={car:i(mt(`car`)),cng:i(mt(`cng`)),rickshaw:i(mt(`rickshaw`)),bus:i(mt(`bus`))};for(let e of[`car`,`cng`,`rickshaw`,`bus`]){let t=z.filter(t=>t.kind===e);if(t.length===0)continue;let r=new b(V[e],B,t.length),i=new n;t.forEach((t,n)=>{i.setFromAxisAngle(new d(0,1,0),t.turn),r.setMatrixAt(n,new N().compose(new d(t.x,v,-t.y),i,new d(1,1,1))),r.setColorAt(n,ht(e,t.tone))}),r.castShadow=!0,r.computeBoundingSphere(),a.add(r)}let{poles:H,spans:U}=ce(l,g);if(H.length>0){let e=i(gt()),t=i(new M({color:`#8d8a83`,roughness:.9})),r=new b(e,t,H.length),o=new Map;for(let[e,t]of U){let n=H[e],r=H[t];if(!n||!r)continue;let i=Math.atan2(r.y-n.y,r.x-n.x);o.has(e)||o.set(e,i),o.has(t)||o.set(t,i)}let s=new n;H.forEach((e,t)=>{s.setFromAxisAngle(new d(0,1,0),o.get(t)??0),r.setMatrixAt(t,new N().compose(new d(e.x,v,-e.y),s,new d(1,1,1)))}),r.castShadow=!0,r.computeBoundingSphere(),a.add(r);let c=i(_t(H,U,v,F(4700))),l=new te(c,i(new m({color:`#1d1d1f`})));a.add(l)}let ue=i(new h(1,1,1)),W=i(ft()),G=new d(0,1,0),de=new n,K=O.map(e=>{let t=e.storeys*3.1;return de.setFromAxisAngle(G,e.turn),{m:new N().compose(new d(e.x,v+t/2,-e.y),de,new d(e.length,t,e.width)),c:new T(ct[Math.floor(e.tone*ct.length)%ct.length]??`#d6d0c2`)}});for(let e of vt(ue,W,K,400))a.add(e);return{group:a,ground:s,counts:{buildings:P.length,trees:R.length,far:O.length,vehicles:z.length,poles:H.length},dispose(){for(let e of t)e.dispose()}}}export{st as addDaylight,yt as buildCity};