"""SHOHOJ / NORTH SOUTH UNIVERSITY — editable reference reconstruction (v1.1).
Not an as-built survey. Footprints, the site and the gates follow OpenStreetMap; facades are
reconstructed from photographs; interiors are representative.

  Full model (.blend + manifest), with real room codes:
    NSU_FEED=feeds/nsu-263.json blender -b -P scripts/nsu_campus_model.py -- /abs/output/dir
  The Campus Map's GLB (exterior only) — run through scripts/build_nsu_campus_model.sh:
    NSU_WEB=/abs/raw.glb blender -b -P scripts/nsu_campus_model.py -- /abs/work/dir

Units are metres, Z up, X along the academic bars; the origin is the middle of the site. The
same frame as src/core/campusNsu.ts, so the GLB needs no transform in the scene.
"""
import bpy, math, random, json, sys, os, numpy as np
from pathlib import Path
from mathutils import Vector
random.seed(24201402)
# NSU_FEED=<feeds/nsu-NNN.json>: give rooms their real codes (NAC210, ...) from NSU's section
# list. A code says which building and floor; WHERE on the floor is not published, so rooms are
# filled in number order. Without it every room keeps an invented REP_ id.
RC={}
if os.environ.get('NSU_FEED'):
 import re
 for sec in json.loads(Path(os.environ['NSU_FEED']).read_text()):
  mm=re.match(r'^(NAC|SAC|LIB|OAT)(\d{1,2})(\d{2})([A-Z]?)$',re.sub(r'[_-]V\d*$','',(sec.get('roomName') or '').strip().upper()))
  if mm and 1<=int(mm.group(2))<=10:RC.setdefault(mm.group(1),{}).setdefault(mm.group(2),set()).add(mm.group(0))
 RC={b:{f:sorted(v,key=lambda c:(int(re.sub(r'\D','',c)),c)) for f,v in d.items()} for b,d in RC.items()}
# NSU_WEB=<out.glb>: build the building a visitor sees from outside and write it as a GLB for the
# Campus Map. Interiors, furniture, small signs and railings are left out (they are
# most of the geometry and invisible from outside; the basements are kept, since the map opens
# them), glass is opaque and brick is a flat colour
# (the page's CSP allows neither transmission passes' cost nor blob: textures).
WEB=os.environ.get('NSU_WEB');LITE=bool(WEB);ARC=8 if LITE else 28
OUT=Path(sys.argv[sys.argv.index('--')+1]);OUT.mkdir(parents=True,exist_ok=True)
(OUT/'previews').mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
S=bpy.context.scene;S.name='01 • NSU | Assembled campus';S.unit_settings.system='METRIC'
S['accuracy']='Reference reconstruction. Dimensions and most interior layouts approximate. Not a verified A-to-Z survey.'
S['project']='Shohoj';S['date']='2026-09-28';S['units']='metres'
ROOT=bpy.data.collections.new('NSU • Editable campus');S.collection.children.link(ROOT)
M={};B={};GEO=[];ROOMS=[];POIS=[];DOORS=[];STAIRS=[];H=3.65
def col(n,p=ROOT,**meta):
 c=bpy.data.collections.new(n);p.children.link(c)
 for k,v in meta.items():c[k]=v
 return c
def mat(n,c,r=.6,metal=0,emit=0,trans=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
 p.inputs['Base Color'].default_value=(*c,1);p.inputs['Roughness'].default_value=r;p.inputs['Metallic'].default_value=metal;p.inputs['Transmission Weight'].default_value=trans
 if emit:p.inputs['Emission Color'].default_value=(*c,1);p.inputs['Emission Strength'].default_value=emit
 M[n]=m;return m
for n,c,r,me in [('Brick',(.66,.54,.4),.76,0),('Stone',(.64,.60,.52),.68,0),('Concrete',(.35,.36,.35),.85,0),('Plaster',(.85,.84,.78),.6,0),('Floor',(.66,.64,.54),.38,0),('Dark stone',(.15,.17,.16),.55,0),('Warm stone',(.52,.42,.32),.6,0),('Metal',(.15,.18,.18),.28,.72),('Steel',(.5,.55,.55),.27,.8),('Oak',(.40,.21,.105),.45,0),('Wood',(.20,.075,.04),.4,0),('Blue seat',(.045,.14,.21),.65,0),('Red seat',(.27,.035,.04),.65,0),('Black',(.035,.048,.06),.4,0),('Paper',(.87,.865,.81),.7,0),('Board',(.83,.86,.80),.28,0),('Grass',(.16,.27,.09),.97,0),('Leaf',(.055,.18,.065),.85,0),('Leaf light',(.19,.32,.09),.8,0),('Bark',(.21,.13,.078),.9,0),('Road',(.075,.08,.08),.99,0),('White',(.92,.92,.85),.56,0),('Gold',(.6,.39,.105),.32,.65),('Red',(.52,.035,.025),.5,0),('Green',(.025,.22,.13),.64,0),('Rubber',(.035,.04,.045),.9,0),('Book teal',(.045,.24,.24),.6,0),('Book ochre',(.64,.33,.065),.6,0),('Book navy',(.035,.065,.16),.6,0),('Book red',(.40,.065,.045),.6,0),('Car pearl',(.72,.75,.73),.2,.5),('Car blue',(.06,.14,.2),.25,.55),('Yellow',(.8,.53,.05),.6,0),('Ceiling',(.85,.85,.8),.8,0),('Rust cladding',(.38,.17,.09),.48,.05)]:mat(n,c,r,me)
mat('Glass',(.18,.29,.29),.12,.15,trans=0 if LITE else .45);mat('Screen',(.1,.26,.35),.24,.1,emit=.22);mat('Light',(.99,.89,.66),.3,emit=3)
# Generate the image IN MEMORY and pack it. No external image dependency can break.
N=512;yy,xx=np.mgrid[0:N,0:N];rows=yy//16;cols=((xx+(rows%2)*32)//64)%8
rng=np.random.default_rng(914);variation=rng.uniform(-.032,.032,(32,8))[rows,cols];mortar=(yy%16<1)|((xx+(rows%2)*32)%64<1)
pixels=np.ones((N,N,4),dtype=np.float32)
for k,v in enumerate([.72,.64,.51]):pixels[:,:,k]=np.clip(v+variation+rng.normal(0,.006,(N,N)),0,1);pixels[:,:,k][mortar]=[.47,.44,.37][k]
im=bpy.data.images.new('NSU original tan brick • packed',N,N,alpha=True);im.pixels.foreach_set(pixels.ravel());im.pack()
if not LITE:m=M['Brick'];ns=m.node_tree.nodes;t=ns.new('ShaderNodeTexImage');t.image=im;p=ns.get('Principled BSDF');m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
if not LITE:bu=ns.new('ShaderNodeBump');bu.inputs['Strength'].default_value=.2;bu.inputs['Distance'].default_value=.009;m.node_tree.links.new(t.outputs['Color'],bu.inputs['Height']);m.node_tree.links.new(bu.outputs['Normal'],p.inputs['Normal'])
class Geo:
 def __init__(self,n,c,**meta):self.n=n;self.c=c;self.meta=meta;self.v=[];self.f=[];self.mi=[];self.ms=[];GEO.append(self)
 def add(self,v,f,m):
  o=len(self.v);self.v.extend(v);self.f.extend([tuple(o+i for i in q) for q in f])
  if m not in self.ms:self.ms.append(m)
  self.mi.extend([self.ms.index(m)]*len(f))
 def box(self,p,d,m='Plaster',rot=0):
  x,y,z=p;w,de,h=d
  if min(d)<=0:return
  cs,sn=math.cos(rot),math.sin(rot);vs=[]
  for a,b,c in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
   u=a*w/2;v=b*de/2;vs.append((x+u*cs-v*sn,y+u*sn+v*cs,z+c*h/2))
  self.add(vs,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m)
 def cyl(self,p,r,h,m='Steel',seg=12,r2=None):
  x,y,z=p;r2=r if r2 is None else r2;v=[(x+rr*math.cos(i*math.tau/seg),y+rr*math.sin(i*math.tau/seg),z+zz) for zz,rr in [(-h/2,r),(h/2,r2)] for i in range(seg)]
  self.add(v,[tuple(reversed(range(seg))),tuple(range(seg,2*seg))]+[(i,(i+1)%seg,(i+1)%seg+seg,i+seg) for i in range(seg)],m)
 def beam(self,a,b,w=.05,m='Steel'):
  a,b=Vector(a),Vector(b);z=(b-a).normalized();q=z.cross(Vector((0,0,1)))
  if q.length<.01:q=z.cross(Vector((0,1,0)))
  q.normalize();r=z.cross(q);v=[tuple(p+q*u*w/2+r*vv*w/2) for p in [a,b] for u,vv in [(-1,-1),(1,-1),(1,1),(-1,1)]]
  self.add(v,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m)
 def ring(self,p,r1,r2,z1,z2,m='Stone',a=0,b=math.tau,n=64):
  x,y=p;v=[(x+r*math.cos(a+(b-a)*i/n),y+r*math.sin(a+(b-a)*i/n),z) for z in [z1,z2] for r in [r1,r2] for i in range(n+1)];k=n+1;f=[]
  for i in range(n):f.extend([(i,i+1,k+i+1,k+i),(2*k+i,3*k+i,3*k+i+1,2*k+i+1),(i,2*k+i,2*k+i+1,i+1),(k+i,k+i+1,3*k+i+1,3*k+i)])
  self.add(v,f,m)
 def finish(self):
  if not self.v:return
  me=bpy.data.meshes.new(self.n);me.from_pydata(self.v,[],self.f)
  for m in self.ms:me.materials.append(M[m])
  for p,i in zip(me.polygons,self.mi):p.material_index=i
  me.update();uv=me.uv_layers.new(name='Metric UV')
  for p in me.polygons:
   axis=max(range(3),key=lambda a:abs(p.normal[a]));idx=[a for a in range(3) if a!=axis]
   for li in p.loop_indices:
    v=me.vertices[me.loops[li].vertex_index].co;uv.data[li].uv=(v[idx[0]]/2.4,v[idx[1]]/2.4)
  ob=bpy.data.objects.new(self.n,me);self.c.objects.link(ob);ob['geometry_accuracy']='approximate'
  for k,v in self.meta.items():ob[k]=v
  return ob
def fr(a,b,s):
 while a<b-.001:yield a;a+=s
def text(n,body,p,size,c,rot=0,m='Black'):
 if LITE and size<.5:return None
 cu=bpy.data.curves.new(n,'FONT');cu.body=body;cu.size=size;cu.align_x='CENTER';cu.extrude=.004;ob=bpy.data.objects.new(n,cu);c.objects.link(ob);ob.location=p;ob.rotation_euler=(math.pi/2,0,rot);cu.materials.append(M[m]);return ob
def rail(g,a,b,h=1.1):
 if LITE:return
 a,b=Vector(a),Vector(b);n=max(1,math.ceil((b-a).length/1.8))
 for i in range(n+1):p=a.lerp(b,i/n);g.beam(p,p+Vector((0,0,h)),.045)
 for z in [.36,.72,h]:g.beam(a+Vector((0,0,z)),b+Vector((0,0,z)),.045)
def slab(g,r,z,holes=(),m='Floor',th=.24):
 x1,x2,y1,y2=r;xs=sorted(set([x1,x2]+[a for h in holes for a in h[:2] if x1<a<x2]));ys=sorted(set([y1,y2]+[a for h in holes for a in h[2:] if y1<a<y2]))
 for a,b in zip(xs,xs[1:]):
  for c,d in zip(ys,ys[1:]):
   x,y=(a+b)/2,(c+d)/2
   if not any(h[0]<x<h[1] and h[2]<y<h[3] for h in holes):g.box((x,y,z-th/2),(b-a,d-c,th),m)
def poi(id,n,p,b,l,t,e='representative',source=''):
 POIS.append(dict(id=id,name=n,building=b,level=str(l),type=t,position_blender=list(p),position_gltf=[p[0],p[2],-p[1]],evidence=e,position_accuracy='approximate',source=source))
def chair(g,x,y,z,rot=0,wood=False,aud=False):
 if LITE:return
 m='Wood' if wood else 'Red seat' if aud else 'Blue seat'
 def b(dx,dy,zz,d,mm):cs,sn=math.cos(rot),math.sin(rot);g.box((x+dx*cs-dy*sn,y+dx*sn+dy*cs,z+zz),d,mm,rot)
 b(0,0,.45,(.46,.46,.075),m);b(0,.21,.76,(.46,.055,.56),m)
 for dx in [-.18,.18]:
  for dy in [-.17,.17]:b(dx,dy,.23,(.036,.036,.42),'Wood' if wood else 'Metal')
def desk(g,x,y,z,w=1.15,d=.58,computer=False):
 if LITE:return
 g.box((x,y,z+.75),(w,d,.055),'Oak')
 for dx in [-w/2+.075,w/2-.075]:
  for dy in [-d/2+.075,d/2-.075]:g.box((x+dx,y+dy,z+.365),(.035,.035,.73),'Metal')
 if computer:
  g.box((x,y+d/2-.16,z+1.03),(.51,.045,.3),'Black');g.box((x,y+d/2-.188,z+1.035),(.46,.008,.255),'Screen');g.box((x,y,z+.79),(.4,.15,.02),'Black');g.box((x,y+d/2-.16,z+.85),(.035,.04,.15),'Metal')
def shelf(g,x,y,z,w=3,rot=0,books=True):
 if LITE:return
 def b(dx,dy,zz,d,m):cs,sn=math.cos(rot),math.sin(rot);g.box((x+dx*cs-dy*sn,y+dx*sn+dy*cs,z+zz),d,m,rot)
 for dx in [-w/2,w/2]:b(dx,0,1.05,(.065,.55,2.1),'Wood')
 b(0,.255,1.05,(w,.045,2.1),'Oak')
 for j in range(6):
  zz=.12+j*.36;b(0,0,zz,(w,.55,.04),'Wood')
  if books and j<5:
   for k in range(int(w/.12)-1):
    ht=random.uniform(.2,.3);b(-w/2+.12+k*.12,-.06,zz+.02+ht/2,(.08,.28,ht),random.choice(['Book teal','Book navy','Book ochre','Book red','Paper']))
def ceiling(g,r,z,coffer=False):
 if LITE:return
 x1,x2,y1,y2=r
 if coffer:
  for x in fr(x1,x2,1.4):g.box((x,(y1+y2)/2,z),(.11,y2-y1,.15),'Ceiling')
  for y in fr(y1,y2,1.4):g.box(((x1+x2)/2,y,z),(x2-x1,.11,.15),'Ceiling')
 for x in fr(x1+2,x2-1,5):
  for y in fr(y1+2,y2-1,4):g.box((x,y,z-.07),(1.1,.38,.04),'Light')
def stairs(c,n,x,y,z,top,w=4.7,run=5.4):
 g=Geo(n,c,element='stairs');rise=top-z;half=rise/2;num=math.ceil(rise/.17/2);step=run/num
 for i in range(num):
  h=(i+1)*half/num;g.box((x-w/4,y+step*(i+.5),z+h/2),(w/2-.15,step+.01,h),'Stone');g.box((x+w/4,y+run-step*(i+.5),z+half+h/2),(w/2-.15,step+.01,h),'Stone')
 g.box((x,y+run+.7,z+half-.12),(w,1.4,.24),'Stone');g.box((x+w/4,y-.65,top-.12),(w/2,1.3,.24),'Stone')
 for xx in [x-w/2,x-.08]:rail(g,(xx,y,z),(xx,y+run,z+half))
 for xx in [x+.08,x+w/2]:rail(g,(xx,y+run,z+half),(xx,y,top))
 rail(g,(x-w/2,y+run+1.4,z+half),(x+w/2,y+run+1.4,z+half));STAIRS.append(dict(id=n,lower=[x-w/4,y,z],upper=[x+w/4,y,top],middle=[x,y+run+.7,z+half]))
def facade(g,r,z,top=False,ground=False,skip_west=False):
 x1,x2,y1,y2=r
 for side in range(4):
  if side==2 and skip_west:continue
  ax=side<2;a,b=(x1,x2) if ax else (y1,y2);fix=[y1,y2,x1,x2][side];num=max(1,round((b-a)/7.4));bay=(b-a)/num
  def box(u,zz,w,ht,de,m):g.box((u,fix,zz) if ax else (fix,u,zz),(w,de,ht) if ax else (de,w,ht),m)
  if not ground:box((a+b)/2,z+.28,b-a,.56,.38,'Brick')
  if not top:box((a+b)/2,z+H-.29,b-a,.58,.50,'Brick')
  for i in range(num):
   c=a+bay*(i+.5);ww=bay-.7;box(a+bay*i,z+H/2,.68,H,.68,'Brick')
   if ground:continue
   box(c,z+.75,ww,.5,.33,'Brick')
   if not top:box(c,z+2.03,ww,1.76,.055,'Glass')
   for off in ([] if LITE else [-ww/2,0,ww/2]):box(c+off,z+2.03,.055,1.8,.11,'Metal')
   for zz in ([] if LITE else [z+1.14,z+2.92]):box(c,zz,ww,.055,.13,'Metal')
   box(c,z+1.08,ww+.18,.08,.65,'Stone')
   if top:
    for k in range(ARC):
     u=-ww/2+ww*(k+.5)/ARC;az=z+2.40+.98*math.sqrt(max(0,1-(u/(ww/2))**2));box(c+u,(z+1.14+az)/2,ww/ARC+.004,az-z-1.14,.055,'Glass');box(c+u,(az+z+H)/2,ww/ARC+.015,z+H-az,.49,'Brick');box(c+u,az,ww/ARC+.01,.14,.56,'Stone')
  box(b,z+H/2,.7,H,.68,'Brick')
def building(id,n,r,levels):
 c=col(id+' • '+n,building=id);B[id]=dict(name=n,rect=r,cy=(r[2]+r[3])/2,levels=levels,col=c,floors=[]);return c
def floor(id,l,z):
 c=col(id+' | '+l,B[id]['col'],building=id,level=l,elevation=z);B[id]['floors'].append(dict(id=l,z=z,collection=c.name));return c
SITE=col('00 • Grounds',element='site');PLAZA=col('01 • Courtyard and memorial',element='public_realm');BASE=col('02 • Basements',element='basement');ROOF=col('90 • Roofs',element='roof');RIG=col('99 • Cameras and light',S.collection)
def roof(id,r,z):
 x1,x2,y1,y2=r;c=col(id+' | Roof',ROOF,building=id,level='roof');g=Geo(id+' roof',c,building=id,level='roof',element='roof');slab(g,r,z,m='Stone')
 for yy in [y1,y2]:g.box(((x1+x2)/2,yy,z+.55),(x2-x1,.32,1.1),'Brick')
 for xx in [x1,x2]:g.box((xx,(y1+y2)/2,z+.55),(.32,y2-y1,1.1),'Brick')
 for xx in fr(x1+8,x2-5,23):
  g.box((xx,(y1+y2)/2,z+1),(3.4,3.3,1.9),'Concrete')
  for k in range(10):g.box((xx-1.45+k*.32,(y1+y2)/2,z+1.98),(.1,3,.05),'Metal')
  for yy in [(y1+y2)/2-.8,(y1+y2)/2+.8]:g.cyl((xx,yy,z+2.04),.55,.1,'Metal',20)
 if id in ['NAC','SAC']:
  for xx in [-65,41]:g.box((xx,(y1+y2)/2+4,z+1.55),(5.7,8,3.1),'Brick');g.box((xx,(y1+y2)/2+4,z+3.2),(6.2,8.6,.2),'Stone')
  for yy in fr(y1+2,y2-1,2.1):g.box(((x1+x2)/2,yy,z+.012),(x2-x1-4,.018,.012),'Dark stone')
def room(c,b,l,i,r,z,kind='Classroom',label=None,published=False,rid=None):
 if LITE:return
 x1,x2,y1,y2=r;cx,cy=(x1+x2)/2,(y1+y2)/2;w,d=x2-x1,y2-y1;n=label or kind;id=rid or f'REP_{b}_{l}_{i:02d}';g=Geo(id+' • '+n,c,building=b,level=l,room_id=id,element='interior')
 for xx in [x1,x2]:g.box((xx,cy,z+1.62),(.14,d,3.24))
 inner=y1 if cy>B[b]['cy'] else y2;dw=1.4
 for sign in [-1,1]:g.box((cx+sign*(w+dw)/4,inner,z+1.65),((w-dw)/2,.15,3.3))
 g.box((cx,inner,z+2.825),(dw,.15,.95))
 for off in [-.7,.7]:g.box((cx+off,inner,z+1.175),(.06,.20,2.35),'Wood')
 rot=0 if inner==y1 else math.pi;dg=Geo(id+'_DOOR',c,interactive='hinged_door',room_id=id,element='door');dg.box((.66,0,1.14),(1.32,.055,2.28),'Oak');dg.box((.76,-.036,1.55),(.56,.016,.64),'Glass');dg.box((1.20,-.07,1.0),(.025,.09,.14),'Steel');ob=dg.finish();GEO.remove(dg);ob.location=(cx-.66*math.cos(rot),inner-.66*math.sin(rot),z);ob.rotation_euler.z=rot+math.radians(75);DOORS.append(dict(id=id+'_DOOR',hinge=list(ob.location),closed_angle=rot,open_angle=ob.rotation_euler.z,width=1.32))
 text(id+' sign',n.upper() if len(n)<24 else kind.upper(),(cx,inner+(-.1 if inner==y1 else .1),z+2.65),.18,c,0 if inner==y1 else math.pi);ceiling(g,(x1+.4,x2-.4,y1+.5,y2-.5),z+3.35)
 if kind in ['Classroom','Seminar','Computer lab','Language lab','Science lab','Electronics lab','Architecture studio','Moot court']:
  g.box((cx,y1+.17,z+1.7),(min(w-1.1,4.3),.08,1.25),'Board');g.box((cx,y1+1,z+.12),(w-1,.95,.24),'Stone');desk(g,cx,y1+1.05,z+.24,1.8,.68)
  num=3 if w<10 else 4
  for rr in range(max(3,int((d-3)/1.35))):
   for cc in range(num):
    xx=x1+1.2+cc*(w-2.4)/(num-1);yy=y1+2.7+rr*1.35;desk(g,xx,yy,z,1,.53,kind in ['Computer lab','Language lab']);chair(g,xx,yy+.62,z)
    if kind in ['Science lab','Electronics lab']:g.box((xx,yy,z+.9),(.3,.24,.23),'Paper');g.cyl((xx+.32,yy,z+.88),.065,.22,'Glass',8)
    if kind=='Architecture studio':g.box((xx,yy,z+.81),(.72,.4,.022),'Paper')
  if kind=='Moot court':g.box((cx,y1+1.35,z+1),(w-2,.8,1),'Wood')
  g.box((cx,cy,z+3.15),(.33,.38,.16),'Paper')
 elif kind in ['Office','Counseling','Medical','Student club','Meeting']:
  if kind=='Medical':
   for xx in [x1+1.8,x2-1.8]:g.box((xx,cy,z+.55),(1.05,2,.16),'Paper');g.box((xx,cy+.75,z+.72),(.75,.45,.16),'White');g.box((xx,cy,z+.25),(.8,1.6,.5),'Steel')
  else:
   for xx in [x1+1.8,x2-1.8]:desk(g,xx,cy,z,1.7,.75,True);chair(g,xx,cy+.8,z)
   shelf(g,cx,y2-.5,z,min(w-2,4));chair(g,cx-.8,y1+2,z,wood=True);chair(g,cx+.8,y1+2,z,wood=True)
 elif kind in ['Prayer','Quiet study']:
  if kind=='Prayer':
   for yy in fr(y1+1,y2-.7,.95):g.box((cx,yy,z+.014),(w-1,.04,.028),'Green')
  else:
   for xx in fr(x1+1,x2-1,1.8):
    for yy in fr(y1+1,y2-1,2):desk(g,xx,yy,z);chair(g,xx,yy+.6,z,wood=True)
 elif kind=='Toilets':
  for xx in fr(x1+1,x2-.8,1.4):g.box((xx,y2-1,z+.38),(.42,.62,.55),'Paper');g.box((xx,y2-.55,z+.68),(.46,.16,.58),'Paper');g.box((xx+.65,y2-1.2,z+1.05),(.06,1.8,2.1));g.box((xx,y1+.7,z+.85),(.65,.45,.1),'Paper');g.box((xx,y1+.15,z+1.5),(.6,.03,.65),'Glass')
 elif kind in ['Lounge','Recreation']:
  for xx in [x1+1.4,x2-1.4]:
   for yy in [cy-1.5,cy+1.5]:g.box((xx,yy,z+.48),(1,2,.5),'Blue seat');g.box((xx,yy+.8,z+.8),(1,.25,.7),'Blue seat')
  g.box((cx,cy,z+.4),(1.2,1.4,.08),'Oak');g.box((cx,y2-.17,z+1.8),(2,.08,1.1),'Black')
  if kind=='Recreation':g.box((cx,cy,z+.77),(1.525,2.74,.05),'Green');g.box((cx,cy,z+.87),(1.6,.016,.18),'White')
 ROOMS.append(dict(id=id,name=n,type=kind,building=b,level=l,bounds=[x1,x2,y1,y2,z,z+3.4],door=[cx,inner,z],position_accuracy='approximate',facility_floor_published=published));poi(id,n,(cx,cy,z+1.6),b,l,kind,'published_facility_floor' if published else 'representative')
print('Helpers ready',flush=True)
for bid,name,r in [('NAC','North Academic Building',(-73,49,-11,16)),('SAC','South Academic Building',(-73,60,-58,-30))]:
 building(bid,name,r,10);x1,x2,y1,y2=r;cy=(y1+y2)/2;holes=[(x-2.6,x+2.6,cy+.65,cy+7.8) for x in [-66,42]]+[(-62,-59,cy-7,cy-4)]
 for lev in range(1,11):
  l='L'+str(lev);z=(lev-1)*H;c=floor(bid,l,z);g=Geo(bid+'_'+l+' structure',c,building=bid,level=l,element='structure');slab(g,r,z,holes);facade(g,r,z,lev==10,lev==1);ceiling(g,(-71,x2-1,cy-2.05,cy+2.05),z+H-.29,lev==1)
  for xx in fr(-72,x2,7.6):
   for yy in [y1-.17,y2+.17]:g.box((xx,yy,z+H/2),(.32,.44,H),'Brick')
  for x in [-66,42]:
   if lev<10:stairs(c,f'{bid}_{l}_STAIR_{x}',x,cy+.8,z,z+H)
  for xx in [-62.15,-58.85]:g.box((xx,cy-5.5,z+1.65),(.22,3.4,3.3),'Concrete')
  g.box((-60.5,cy-7.15,z+1.65),(3.5,.22,3.3),'Concrete');g.box((-60.5,cy-3.96,z+2.65),(3.3,.25,1),'Concrete')
  for dx in [-1.2,1.2]:g.box((-60.5+dx,cy-3.8,z+1.1),(.14,.18,2.2),'Steel')
  poi(f'{bid}_{l}_LIFT',name+' lift landing',(-60.5,cy-3.2,z+1.6),bid,l,'lift_landing');text(bid+l+' label',f'{bid} / LEVEL {lev}',(-56,cy,z+2.7),.35,c)
  for side in [-1,1]:
   for i in range(9):
    a=-55+i*91/9+.1;b=-55+(i+1)*91/9-.1;ys=(y1+.4,cy-2.15) if side==-1 else (cy+2.15,y2-.4);typ='Classroom';label=None;pub=False
    if lev==1:typ=['Lounge','Quiet study','Student club','Recreation','Office','Toilets','Prayer','Lounge','Office'][i]
    elif lev==10:typ='Office' if i<7 else 'Meeting'
    elif bid=='SAC':
     if lev in [2,3] and i%3==0:typ='Computer lab'
     if lev in [5,6] and i%3==0:typ='Electronics lab'
     if lev in [7,8] and i%3==0:typ='Science lab'
     if lev==9 and i<4:typ='Architecture studio'
     if lev==4 and side==-1 and i==1:typ='Medical';label='Medical Center';pub=True
    elif bid=='NAC':
     if lev==6 and side==-1 and i==2:typ='Moot court';label='Moot Court';pub=True
     elif lev in [4,5] and i==1:typ='Language lab'
     elif i==8:typ='Seminar'
    k=(0 if side==1 else 9)+i;codes=RC.get(bid,{}).get(str(lev),[]);rid=codes[k] if k<len(codes) else None
    if rid:typ='Classroom';label=rid;pub=True
    room(c,bid,l,k+1,(a,b,*ys),z,typ,label,pub,rid)
 roof(bid,r,10*H);text(bid+' name',name.upper(),(-10,y1-.45 if bid=='NAC' else y2+.45,5.85),.64,B[bid]['col'],0 if bid=='NAC' else math.pi)
print('Academic blocks ready',flush=True)
building('ADM','Administrative Building',(-102,-73,-36,-6),8)
for lev in range(1,9):
 l='L'+str(lev);z=(lev-1)*H;c=floor('ADM',l,z);g=Geo('ADM_'+l+' structure',c,building='ADM',level=l,element='structure');slab(g,(-102,-73,-36,-6),z,[(-100,-94,-16,-8)]);facade(g,(-102,-73,-36,-6),z,lev==8,lev==1,True);slab(g,(-73,-55,-30,-11),z)
 for yy in [-29.7,-11.3]:rail(g,(-73,yy,z),(-55,yy,z))
 if lev<8:stairs(c,'ADM_'+l+'_STAIR',-97,-15.5,z,z+H)
 if lev==1:
  g.box((-88,-19,.54),(4,1.1,1.08),'Oak');text('Information','INFORMATION',(-88,-19.57,1.8),.27,c);room(c,'ADM',l,1,(-90,-75,-35.5,-23),z,'Office','Book Shop / Information',True)
 else:
  for i,rr in enumerate([(-92,-83,-35.5,-23),(-83,-74,-35.5,-23),(-92,-83,-19,-6.5),(-83,-74,-19,-6.5)]):
   typ='Counseling' if lev==4 and i==1 else 'Office';room(c,'ADM',l,i+1,rr,z,typ,'Counseling & Wellbeing' if typ=='Counseling' else None,typ=='Counseling')
roof('ADM',(-102,-73,-36,-6),8*H)
# Front façade follows the public front-view photograph: tall portico, rust cladding, glazed bays, curved crown.
c=B['ADM']['col'];g=Geo('ADM • monumental front elevation',c,building='ADM',element='exterior')
for yy in [-35,-7]:g.box((-102,yy,14),(.9,2,28),'Brick')
for a,b in [(-33,-27),(-26,-20),(-19,-13),(-12,-9)]:
 g.box((-102.25,(a+b)/2,14),(.06,b-a,24),'Glass')
 for z in fr(2,27,3.65):g.box((-102.38,(a+b)/2,z),(.14,b-a,.16),'Rust cladding')
 for yy in fr(a,b,1.4):g.box((-102.4,yy,14),(.12,.055,24),'Metal')
for yy in [-33,-26,-19,-12]:
 g.box((-103.1,yy,13.5),(1.3,.68,27),'Rust cladding');g.box((-103.2,yy,26.85),(1.65,1.22,.36),'Stone')
g.box((-103.2,-21,28),(1.5,29,1.85),'Rust cladding')
for i in range(56):
 yy=-35.5+29*(i+.5)/56;top=29+1.5*math.sqrt(max(0,1-((yy+21)/14.5)**2));g.box((-103.2,yy,(28.85+top)/2),(1.45,29/56+.01,top-28.85),'Rust cladding')
o=text('NSU front name','NORTH SOUTH UNIVERSITY',(-104.0,-21,27.65),.97,c,-math.pi/2,'White');o.data.space_character=1.38
for i in range(6):g.box((-108+i*.6,-21,.15*(i+1)),(1.2,24,.3*(i+1)),'Stone')

levels=[('L'+str(i),(i-1)*H) for i in range(1,11)]
building('LIB','Library Building',(60,104,-58,-14),10);LC={}
LIBLAB={'L3':'Main Collection & Circulation','L4':'Reference Section'}
for ii,(l,z) in enumerate(levels):
 codes=RC.get('LIB',{}).get(str(ii+1),[])
 c=floor('LIB',l,z);LC[l]=c;g=Geo('LIB_'+l+' architecture',c,building='LIB',level=l,element='structure');holes=[(61.3,67,-55,-47.1),(98,103.4,-34,-26.1)]
 slab(g,(60,104,-58,-14),z,holes)
 for x in [60,104]:
  for yy in [-57,-48,-44,-29,-25,-15]:g.box((x,yy,z+H/2),(.7,.75,H),'Brick')
  for a,b in [(-57,-48),(-48,-44),(-44,-29),(-29,-25),(-25,-15)]:
   # Leave the published main-floor entrance zone open.
   if not(x==60 and l=='L3' and a==-29):g.box((x,(a+b)/2,z+1.72),(.055,b-a-.5,3.1),'Glass')
   for y in fr(a+.15,b,.95):g.box((x-.04,y,z+1.72),(.1,.045,3.15),'Metal')
   for zz in [z+.15,z+1.82,z+3.25]:g.box((x-.04,(a+b)/2,zz),(.1,b-a,.055),'Metal')
  g.box((x,-36,z+H-.15),(.8,44,.3),'Brick')
 for yy in [-58,-14]:
  for xx in fr(61,104,5.4):g.box((xx,yy,z+H/2),(.7,.55,H),'Brick');g.box((xx+2.6,yy,z+2.05),(4.6,.055,1.75),'Glass')
  g.box((82,yy,z+.65),(44,.45,1.3),'Brick');g.box((82,yy,z+H-.2),(44,.5,.4),'Brick')
  for yy in [-51,-23]:g.box((x,yy,z+1.7),(.65,.65,3.4),'Wood')
 ceiling(g,(61,103,-57,-15),z+3.35,True)
 if ii<9:stairs(c,'LIB_'+l+'_WEST_STAIR',64.1,-54.3,z,levels[ii+1][1],4.6);stairs(c,'LIB_'+l+'_EAST_STAIR',100.6,-33.3,z,levels[ii+1][1],4.4)
 label=LIBLAB.get(l,'Classroom floor' if codes else 'Library Building floor | use unverified')
 if codes:
  # Real room codes from NSU's section list; positions on the floor are NOT published.
  for k,rid in enumerate(codes[:12]):
   i=k//2;a=68+i*4.9;ys=(-55,-38.15) if k%2==0 else (-33.85,-17)
   room(c,'LIB',l,k+1,(a,a+4.6,*ys),z,'Classroom',rid,True,rid)
 else:
  for x in [69,86,96]:
   for yy in [-51,-23]:g.box((x,yy,z+1.7),(.65,.65,3.4),'Wood')
  f=Geo('LIB_'+l+' furniture',c,building='LIB',level=l,element='interior')
  if l=='L3':
   f.box((68,-20.5,z+.55),(6,2,1.1),'Oak');f.cyl((71,-20.5,z+.55),1,1.1,'Oak',24);text('Circulation sign','CIRCULATION',(68,-21.54,z+1.5),.3,c)
   for y in [-26,-29]:f.box((66.5,y,z+.58),(.6,.52,1.16),'Oak');f.box((66.5,y,z+1.29),(.56,.14,.31),'Screen')
   for y in [-27,-31,-35,-39,-43]:shelf(f,92,y,z,3,-math.pi/2)
   for x in [71,75,79,83,87]:shelf(f,x,-53,z,3.2,math.pi)
   for x in [75,80,85]:
    for y in [-20,-24,-46,-49]:
     desk(f,x,y,z,2.3,1.1)
     for dx in [-.65,.65]:chair(f,x+dx,y+.84,z,wood=True);chair(f,x+dx,y-.84,z,math.pi,wood=True)
   for x in [74,79,84]:
    for y in [-32,-38]:
     desk(f,x,y,z,2.4,1.15)
     for dx in [-.65,.65]:chair(f,x+dx,y+.9,z,wood=True);chair(f,x+dx,y-.9,z,math.pi,wood=True)
   f.ring((78.5,-35),8.2,8.4,z+.004,z+.012,'Dark stone',n=80)
   for yy in [-50,-19]:desk(f,100,yy,z,2,.8,True)
  else:
   for x in [69,75,81,87,93]:
    for y in [-20,-25,-45,-50]:desk(f,x,y,z,2,.85);chair(f,x-.58,y+.74,z,wood=True);chair(f,x+.58,y+.74,z,wood=True)
   if l=='L4':
    for y in [-27,-32,-37,-42]:shelf(f,94,y,z,3.2,-math.pi/2)
    for x in [71,75,79,83,87]:shelf(f,x,-54,z,3.1,math.pi)
 poi('LIB_'+l,label,(68,-27,z+1.6),'LIB',l,'library','published_facility_floor' if l in LIBLAB else 'representative','https://library.northsouth.edu/about-nsu-library/collection-map/')
 text('LIB_'+l+' sign',label.upper().split('|')[0],(80,-15,z+2.7),.32,c);ROOMS.append(dict(id='LIB_'+l,name=label,type='Library',building='LIB',level=l,position_accuracy='approximate'))
roof('LIB',(60,104,-58,-14),10*H);g=Geo('LIB • arched crown',B['LIB']['col'],building='LIB',element='exterior')
for ya,yb,rise in [(-44,-29,3.5),(-57,-48,1.8),(-25,-15,1.8)]:
 mid=(ya+yb)/2;w=yb-ya
 for i in range(40):
  u1=ya+w*i/40;u2=ya+w*(i+1)/40;z1=34.35+rise*math.sqrt(max(0,1-((u1-mid)/(w/2))**2));z2=34.35+rise*math.sqrt(max(0,1-((u2-mid)/(w/2))**2));g.add([(59.55,u1,z1),(59.55,u2,z2),(59.55,u2,39.45),(59.55,u1,39.45)],[(0,1,2,3)],'Brick');g.beam((59.4,u1,z1),(59.4,u2,z2),.28,'Stone')
for yy in [-58,-45,-28,-14]:g.box((59.7,yy,19.7),(1,.65,39.45),'Brick')
text('LIB • name','NSU CENTRAL LIBRARY',(59.13,-36.5,8.45),.76,B['LIB']['col'],-math.pi/2,'Gold')
print('Administration and library ready',flush=True)
building('OAT','Auditorium Building',(69,106,-2,44),10)
# ONE building on OpenStreetMap's footprint (10 levels tagged). v1.0 split it into an invented
# 8-storey 'LHC' and a 3-level 'AUD' about 20 m off. OAT room codes are placed here by inference.
for lev in range(1,11):
 l='L'+str(lev);z=(lev-1)*H;c=floor('OAT',l,z);g=Geo('OAT_'+l+' structure',c,building='OAT',level=l,element='structure');slab(g,(69,106,-2,44),z,[(71,77,33,40.5)]);facade(g,(69,106,-2,44),z,lev==10,lev==1)
 if lev<10:stairs(c,'OAT_'+l+'_STAIR',74,33.5,z,z+H)
 for k,rid in enumerate(RC.get('OAT',{}).get(str(lev),[])[:6]):
  i=k//2;a=79+i*9;ys=(8,18.85) if k%2==0 else (23.15,34)
  room(c,'OAT',l,k+1,(a,a+8.6,*ys),z,'Classroom',rid,True,rid)
 poi('OAT_'+l,'Auditorium Building level '+str(lev),(87,21,z+1.6),'OAT',l,'building_level','osm_footprint_and_levels_tag')
roof('OAT',(69,106,-2,44),10*H);g=Geo('OAT • curved roof',B['OAT']['col'],building='OAT',element='roof')
for i in range(24):g.box((69+37*(i+.5)/24,21,10*H+1.2+2.3*math.sin((i+.5)/24*math.pi)),(37/24+.02,32,.15),'Metal')
text('OAT name','NORTH SOUTH UNIVERSITY\nAUDITORIUM',(87.5,-2.38,6.1),.52,B['OAT']['col'])
zs=[-9.8,-9.8*2/3,-9.8/3]
for ii,z in enumerate(zs):
 l='B'+str(3-ii);c=col(l+' • Parking & services',BASE,building='BASE',level=l);g=Geo(l+' structure and parking',c,building='BASE',level=l,element='structure');holes=[(-111,-80,-60,-52)]
 for bid in ['NAC','SAC']:
  cy=B[bid]['cy'];holes += [(x-2.6,x+2.6,cy+.65,cy+7.8) for x in [-66,42]]+[(-62,-59,cy-7,cy-4)]
 slab(g,(-111,104,-60,18),z,holes,'Concrete',.3)
 for x in fr(-100,102,12):
  for y in [-54,-31,-8,13]:
   if not(x<-78 and y==-54):g.box((x,y,z+1.4),(.64,.64,2.8),'Concrete');g.box((x,y,z+.6),(.67,.67,.65),'Yellow')
 for y in [-45,-21,5]:
  for x in fr(-72,99,3):g.box((x,y,z+.01),(.055,5.1,.018),'White')
  for x in fr(-67,94,18):
   if random.random()<.28:continue
   m=random.choice(['Car pearl','Car blue','Black']);g.box((x,y,z+.55),(1.85,4.45,.7),m);g.box((x,y+.1,z+1.17),(1.56,2.45,.66),'Glass');g.box((x,y+.05,z+1.53),(1.63,2.3,.1),m)
   for dx in [-.89,.89]:
    for dy in [-1.4,1.4]:g.box((x+dx,y+dy,z+.31),(.18,.63,.59),'Rubber')
 top=zs[ii+1] if ii<2 else 0
 for bid in ['NAC','SAC']:
  for x in [-66,42]:stairs(c,l+'_'+bid+'_STAIR_'+str(x),x,B[bid]['cy']+.8,z,top)
 for k in range(60):g.box((-110+(k+.5)*.5,-56,z+(top-z)*(k+.5)/60-.16),(.52,6,.32),'Concrete')
 ceiling(g,(-108,102,-58,16),z+3.01);text(l+' sign',l+' / PARKING',(-75,-59.65,z+1.6),.8,c,math.pi,'Yellow');poi('PARKING_'+l,'Basement parking '+l,(-72,-54,z+1.6),'BASE',l,'parking','published_level_reconstructed_layout')
 if l=='B1':
  gg=Geo('B1 transport lab',c,building='LIB',level=l,element='interior');gg.box((96,-36,z+1.4),(16,.16,2.8))
  for x in [89,94,99]:desk(gg,x,-41,z,2.1,.8);gg.cyl((x,-45,z+.65),.6,1.3,'Metal',16)
  poi('LIB_B1_TRANSPORT','Transportation Engineering Laboratory',(90,-41,z+1.6),'LIB','B1','laboratory','published_facility_floor')
print('Six blocks and basements ready',flush=True)

g=Geo('Grounds and arrival',SITE,element='landscape');slab(g,(-118,119,-66,69),-.20,[(-111,-80,-60,-52)],'Stone',.25)
g.box((-125,0,-.22),(12,157,.15),'Road')
g.box((0,77,-.22),(260,12,.15),'Road');g.box((0,-64,-.04),(228,6,.08),'Road')
for y in fr(-65,77,7):
 g.box((-125,y,-.13),(.13,3.5,.015),'Yellow')
for x in fr(-120,125,7):g.box((x,77,-.13),(3.5,.13,.015),'Yellow')
for x in [-116,117]:
 for y in fr(-64,69,3.4):
  if not(x<0 and -34<y<-10):g.box((x,y,.65),(.45,.45,1.5),'Brick');g.box((x,y+1.5,.78),(.08,3,.9),'Metal')
for y in [68,-62]:
 for x in fr(-114,116,5):g.box((x,y,.4),(4.8,.30,.8),'Brick')
def tree(g,x,y,z=0,s=1):
 g.cyl((x,y,z+2.7*s),.15*s,5.4*s,'Bark',9,.09*s)
 for k in range(7):
  a=k*2.399;r=random.uniform(.8,1.8)*s;p=(x+r*math.cos(a),y+r*math.sin(a),z+(4.8+random.random()*1.4)*s);g.beam((x,y,z+3.4*s),p,.10*s,'Bark')
  for j in range(55):
   aa=random.random()*math.tau;ra=random.random()**.5*1.6*s;xx=p[0]+math.cos(aa)*ra;yy=p[1]+math.sin(aa)*ra;zz=p[2]+random.uniform(-.65,.65)*s;w=random.uniform(.18,.46)*s;d=random.uniform(.12,.28)*s;g.add([(xx-w,yy,zz),(xx,yy-d,zz+.08),(xx+w,yy,zz),(xx,yy+d,zz+.08)],[(0,1,2,3)],random.choice(['Leaf','Leaf light']))
def palm(g,x,y,z=0,s=1):
 h=6.4*s;g.cyl((x,y,z+h/2),.15*s,h,'Bark',10,.105*s)
 for zz in fr(z+.2,z+h,.25*s):g.cyl((x,y,zz),.156*s,.035*s,'Stone',10)
 for k in range(10):
  a=k*math.tau/10;prev=Vector((x,y,z+h))
  for i in range(1,9):
   t=i/8;r=3.1*s*t;p=Vector((x+math.cos(a)*r,y+math.sin(a)*r,z+h+s*math.sin(t*math.pi)-.8*s*t));g.beam(prev,p,.025*s,'Leaf');side=Vector((-math.sin(a),math.cos(a),0));w=.6*s*math.sin(t*math.pi)
   for sign in [-1,1]:tip=p+side*w*sign+Vector((-math.cos(a)*.35*s,-math.sin(a)*.35*s,-.17*s));g.add([tuple(prev),tuple(p),tuple(tip)],[(0,1,2)],'Leaf' if k%2 else 'Leaf light')
   prev=p
def planter(g,x,y,w,d,z=0):
 g.box((x,y,z+.4),(w,d,.8),'Brick');g.box((x,y,z+.81),(w-.18,d-.18,.08),'Grass')
 for xx in fr(x-w/2+.2,x+w/2,.44):
  for yy in fr(y-d/2+.2,y+d/2,.44):g.cyl((xx,yy,z+1.05),.25,.4,'Leaf',7,.17)
def lamp(g,x,y,z=0):g.cyl((x,y,z+1.8),.055,3.6,'Metal',10);g.cyl((x,y,z+3.6),.46,.14,'Metal',20,.24);g.cyl((x,y,z+3.5),.32,.04,'Light',16)
for x in [-108,-83,-20,15,111]:
 for y in [23,62]:planter(g,x,y,4,3);tree(g,x,y,.83,random.uniform(.8,1.15))
for x in [-109,110]:
 for y in [-44,-3,20,46]:lamp(g,x,y);tree(g,x+3,y,0,.8)
g.box((-49,46.8,.015),(38,35,.055),'Grass')
for x in [-66,-32]:g.box((x,46.8,.052),(.08,31,.02),'White')
for y in [31.3,62.3]:g.box((-49,y,.052),(34,.08,.02),'White')
g.box((-49,46.8,.052),(34,.08,.02),'White');g.ring((-49,46.8),4.5,4.58,.05,.065,'White',n=48)
for y in [31.4,62.2]:
 for x in [-52,-46]:g.beam((x,y,.1),(x,y,2.4),.08,'White')
 g.beam((-52,y,2.4),(-46,y,2.4),.08,'White')
poi('PLAYGROUND','NSU Playground',(-48,47,1.6),'SITE','G','playground','mapped_footprint')
for yy in [23,31]:g.box((-115,yy,2.2),(.8,.8,4.4),'Brick')
g.box((-115,27,4.25),(.9,9,1),'Brick');text('Gate west','WEST GATE',(-115.51,27,4.25),.31,SITE,-math.pi/2);poi('GATE_WEST','West gate',(-114,27,1.7),'SITE','G','gate','osm_node')
for gx,gy,gn in [(-110,-64.5,'GATE 1'),(54,68.5,'GATE 8')]:
 for xx in [gx-4,gx+4]:g.box((xx,gy,2.2),(.8,.8,4.4),'Brick')
 g.box((gx,gy,4.25),(9,.9,1),'Brick');text(gn,gn,(gx,gy-.51,4.25),.31,SITE);poi(gn.replace(' ','_'),gn.title(),(gx,gy,1.7),'SITE','G','gate','osm_node')
g.box((-109,2,1.6),(3.8,4.2,3.2),'Brick');g.box((-111,2,1.9),(.055,2.8,1.1),'Glass')
for y in [-2,3,8]:g.cyl((-107,y,5.2),.04,10.4,'Steel',12);g.box((-105.6,y,9.4),(2.8,.05,1.65),'Green')
for i in range(8):
 x=-106+i*1.4;g.beam((x,58,.1),(x,58,.85));g.beam((x,58,.85),(x,59.2,.85));g.beam((x,59.2,.85),(x,59.2,.1))
# v1.0 drew four 'northern ancillary masses' here. They are separate apartment blocks, not NSU's.
g=Geo('Courtyard paving and gallery',PLAZA,element='public_realm')
if LITE:g.box((2.5,-20.5,-.035),(115,19,.06),'Stone')
for x in ([] if LITE else fr(-55,60,1)):
 for y in fr(-30,-11,1):g.box((x+.49,y+.49,-.035),(.975,.975,.06),'Dark stone' if int(x)%9 in [0,1] or int(abs(y))%9==0 else 'Stone' if (int(x)+int(y))%5 else 'Warm stone')
for x in [-43,-23,-3,17,38]:
 for y in [-28.3,-12.7]:planter(g,x,y,5.2,2);palm(g,x,y,.9,.86);lamp(g,x+3.5,y)
for x in [-42,-19,4,27]:
 for y in [-26,-15]:
  g.box((x,y,.46),(2.3,.6,.12),'Oak')
  for dx in [-.9,.9]:g.box((x+dx,y,.23),(.1,.48,.46),'Concrete')
  rail(g,(x-1.2,y+.33,.4),(x+1.2,y+.33,.4),.46)
for i in range(12):x=-53+i*.72;ht=(12-i)*.25;g.box((x,-20.5,ht/2),(.75,13.8,ht),'Warm stone');g.box((x+.3,-20.5,ht+.025),(.15,13.8,.05),'Stone')
for y in [-27.6,-13.4]:rail(g,(-53,y,3),(-44.5,y,0))
for i in range(8):g.ring((45,-20.5),2.5+i*.6,3.10+i*.6,0,.18*(8-i),'Warm stone',math.pi/2,3*math.pi/2,36)
g.box((46,-20.5,.25),(3,12,.5),'Wood');poi('OPEN_GALLERY','Open Gallery',(-41,-20.5,1.6),'SITE','G','open_gallery','photo_reference');poi('OAT','Open-air theatre',(39,-20.5,1.6),'SITE','G','amphitheatre','facility_confirmed_layout_inferred')
br=Geo('Skybridge • glazed steel truss',PLAZA,element='bridge');br.box((-33,-20.5,2*H-.16),(5.8,19,.32),'Stone');br.box((-33,-20.5,2*H+3.15),(6.1,19.4,.23),'Metal')
for x in [-35.9,-30.1]:
 br.box((x,-20.5,2*H+1.55),(.05,19,3),'Glass')
 for z in [2*H+.15,2*H+3.03]:br.beam((x,-30,z),(x,-11,z),.16,'Gold')
 for k in range(7):y=-30+k*19/7;br.beam((x,y,2*H+.15),(x,y+19/7,2*H+3.03),.11,'Gold');br.beam((x,y,2*H+3.03),(x,y+19/7,2*H+.15),.09,'Gold')
# The Shaheed Minar is not modelled: v1.0 put it at (93,18), which is inside the Auditorium Building.
poi('ENTRANCE','Main entrance',(-111,-20,1.7),'SITE','G','entrance')
service=Geo('Student service kiosks',PLAZA,element='services')
for x in [-50,-48.5]:service.box((x,-12.1,1.1),(1.05,.65,2.2),'Black');service.box((x,-12.45,1.35),(.7,.04,.45),'Screen');service.box((x,-12.55,.91),(.68,.28,.075),'Steel')
poi('ATM','ATM booths',(-49,-14,1.6),'SITE','G','atm','facility_confirmed_placement_inferred');poi('CPC','Career & Placement Center — representative',(-86,-28,2*H+1.6),'ADM','L3','student_service','facility_confirmed_floor_inferred');poi('CLUBS','Student club spaces',(-30,10,1.6),'NAC','L1','student_clubs','facility_confirmed_floor_inferred')
LIFTS=col('85 • Lift cabins and presentation rig',element='transport')
for bid in ['NAC','SAC']:
 cy=B[bid]['cy'];g=Geo(bid+' lift cabin',LIFTS,building=bid,interactive='lift_cabin');g.box((0,0,-.08),(2.55,2.6,.16),'Dark stone');g.box((0,0,2.7),(2.55,2.6,.13),'Steel');g.box((0,-1.25,1.32),(2.55,.1,2.64),'Steel')
 for x in [-1.23,1.23]:g.box((x,0,1.32),(.1,2.6,2.64),'Steel')
 rail(g,(-1.12,-1.08,.1),(1.12,-1.08,.1),.95);g.box((1.16,.9,1.2),(.02,.28,.46),'Black');o=g.finish();GEO.remove(g);o.location=(-60.5,cy-5.5,0);o['note']='Illustrative lift animation only; no operational call / door logic.'
 if bid=='NAC':
  for frame,z in [(1,0),(60,0),(300,9*H),(360,9*H),(600,0)]:o.location.z=z;o.keyframe_insert(data_path='location',frame=frame)
 o.location.z=0
print('Landscape and transport ready',flush=True)
for i,g in enumerate(GEO):
 g.finish()
 if i%100==0:print('Mesh batches',i,'/',len(GEO),flush=True)
def empty(n,c,parent=None,**meta):
 o=bpy.data.objects.new(n,None);c.objects.link(o);o.parent=parent;o.empty_display_size=.4
 for k,v in meta.items():o[k]=v
 return o
camp=empty('NSU_CAMPUS',ROOT,campus_id='nsu',project='Shohoj',version='1.1-reference',accuracy='Approximate reference reconstruction; not as-built',units='metres')
def group(c,parent,n,**meta):
 current=list(c.objects);e=empty(n,c,parent,**meta)
 for o in current:
  if o.parent is None:o.parent=e
 return e
for bid,data in B.items():
 be=group(data['col'],camp,'NSU_'+bid,kind='building',building=bid,label=data['name'])
 for fl in data['floors']:group(bpy.data.collections[fl['collection']],be,'NSU_'+bid+'_'+fl['id'],kind='floor',building=bid,level=fl['id'],elevation=fl['z'],position_accuracy='approximate')
for cc in [SITE,PLAZA,BASE,ROOF,LIFTS]:
 # The basements are a building to the Campus Map: NSU_BAS, with NSU_BAS_L1 (B1) to NSU_BAS_L3.
 e=group(cc,camp,'NSU_BAS' if cc is BASE else 'NSU_'+cc.name.split(' • ')[-1].replace(' ','_'),kind='group')
 for sub in cc.children:group(sub,e,'NSU_BAS_L'+str(sub.get('level'))[1:] if cc is BASE else 'NSU_'+sub.name.replace(' | ','_'),kind='floor',level=str(sub.get('level','')),building=str(sub.get('building','')))
def camera(n,loc,target,lens=40,ortho=None):
 d=bpy.data.cameras.new(n);o=bpy.data.objects.new(n,d);RIG.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler();d.lens=lens;d.clip_end=1500
 if ortho:d.type='ORTHO';d.ortho_scale=ortho
 return o
hero=camera('01 • Campus overview',(-212,-238,188),(-2,0,9),43)
camera('02 • Courtyard',(-17,-21.5,2.15),(60,-29,14.8),20)
camera('03 • Library reading floor',(67,-46,2*H+1.67),(87,-29,2*H+1.4),24)
camera('04 • Teaching room',(-13.6,-.65,H+1.65),(-10,-10.4,H+1.35),20)
camera('05 • Library section',(21,-102,67),(81,-35,11),ortho=75)
camera('06 • Plan',(0,0,260),(0,0,0),ortho=280)
camera('07 • Administrative entrance',(-159,-28,13),(-101,-21,14),35)
world=bpy.data.worlds.new('Dhaka • soft daylight');S.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.58,.69,.80,1);world.node_tree.nodes['Background'].inputs[1].default_value=.48
sun=bpy.data.lights.new('Late morning sun','SUN');sun.energy=2.4;sun.angle=math.radians(9);o=bpy.data.objects.new('Late morning sun',sun);RIG.objects.link(o);o.rotation_euler=(.43,-.5,-.55)
def area(n,loc,target,power,size,color=(1,1,1)):
 d=bpy.data.lights.new(n,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color;o=bpy.data.objects.new(n,d);RIG.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()
area('Sky fill',(-70,-80,150),(0,0,0),12000,100,(.78,.86,1))
for x in [69,80,92]:
 for y in [-23,-40,-51]:area('Library ceiling panel',(x,y,2*H+3.18),(x,y,2*H),450,3.2,(1,.89,.72))
area('Teaching room ceiling',(-10,-5.1,H+3.25),(-10,-5.1,H),230,3.4)
S.camera=hero;S.render.engine='CYCLES';S.cycles.device='CPU';S.cycles.samples=32;S.cycles.use_denoising=True;S.render.threads_mode='FIXED';S.render.threads=8;S.render.resolution_x=1600;S.render.resolution_y=1060;S.render.resolution_percentage=100;S.render.image_settings.file_format='PNG';S.view_settings.view_transform='AgX';S.view_settings.look='AgX - Medium High Contrast';S.render.fps=30;S.frame_end=600;S.frame_set(1)
# A separate section scene leaves the complete campus intact.
sec=bpy.data.scenes.new('02 • Library | sectional study');sec.world=world;sec.collection.children.link(RIG)
for fl in B['LIB']['floors']:
 if fl['id'] in ['L3','L4']:sec.collection.children.link(bpy.data.collections[fl['collection']])
sec.camera=bpy.data.objects['05 • Library section'];sec.render.engine='CYCLES';sec.cycles.samples=32;sec.cycles.use_denoising=True;sec.render.resolution_x=1600;sec.render.resolution_y=1060;sec.view_settings.view_transform='AgX'
for a in bpy.context.screen.areas if bpy.context.screen else []:
 if a.type=='VIEW_3D':a.spaces.active.region_3d.view_perspective='CAMERA';a.spaces.active.shading.type='MATERIAL'
intro='''SHOHOJ / NORTH SOUTH UNIVERSITY — v1.1 REFERENCE MODEL
September 2026 | metres | Blender Z-up

This is an editable, evidence-informed reconstruction, NOT a complete verified
A-to-Z digital twin. Exterior proportions are approximate; many interior room
layouts, furniture, levels, service placements and routes are representative.
Published library collection diagrams informed the library zoning, not survey
dimensions. Admin storey counts conflict across sources. Building footprints, gates and the
Auditorium Building follow OpenStreetMap (v1.1).

NAVIGATION: Numpad 0 opens the active camera; select another camera in 99 Cameras
and Light. Use Blender Walk Navigation (Shift+`) for manual inspection. Collision
or route continuity has not been validated. Use the Outliner to isolate floors.
Scene 02 is a library section. All architectural floors are separately grouped.
Doors have local hinge origins and open/closed angles in the JSON manifest.
One NAC lift has an illustrative 600-frame animation; no lift controller exists.

ROOM IDS: codes like NAC210 are real, from NSU's section list; their POSITION on the
floor is not published and is a number-order guess. REP_ ids are invented placeholders.
The GLBs carry building/floor/object metadata for future Shohoj integration.
No route engine, collision physics, accessible-path audit or live integration is
included. Provide current measured plans and a campus photo survey to verify it.

Open README.md and SOURCES-AND-ACCURACY.md in the project package before use.
'''
bpy.data.texts.new('START HERE • Accuracy and controls').write(intro)
bpy.data.texts.new('build_nsu.py').write(Path(__file__).read_text())
meshes=[o for o in S.objects if o.type=='MESH'];stats=dict(buildings=len(B),modeled_rooms_or_large_spaces=len(ROOMS),facility_anchors=len(POIS),hinged_doors=len(DOORS),stair_flight_pairs=len(STAIRS),mesh_objects=len(meshes),polygons=sum(len(o.data.polygons) for o in meshes),vertices=sum(len(o.data.vertices) for o in meshes),materials=len(M),packed_images=sum(bool(i.packed_file) for i in bpy.data.images))
manifest=dict(campus_id='nsu',project='Shohoj',version='1.1-reference',date='2026-09-28',status='reference_reconstruction_requires_survey',units='metres',blender_axes='Z up; X along academic bars',gltf_axes='Y up; [blender_x, blender_z, -blender_y]',approximate_georeference=dict(longitude=90.4261,latitude=23.81535,rotation_degrees=5.7,note='Indicative anchor only; not a surveyed CRS transform'),warnings=['All geometric dimensions approximate.','REP room IDs are invented identifiers, not official room numbers.','Published facility floors do not verify modeled door positions.','Admin storey counts conflict between sources.','Routes, stair clearances, accessibility and collision meshes are not validated.','Northern ancillary masses have unknown uses.','No claim of all current campus facilities or every interior.'],statistics=stats,buildings={k:{a:v for a,v in d.items() if a!='col'} for k,d in B.items()},rooms=ROOMS,points_of_interest=POIS,doors=DOORS,stairs=STAIRS)
if LITE:
 bpy.ops.object.select_all(action='DESELECT');kept=0
 for o in S.objects:
  if o.type in ('MESH','FONT','EMPTY') and RIG not in o.users_collection:o.select_set(True);kept+=o.type!='EMPTY'
 bpy.ops.export_scene.gltf(filepath=WEB,export_format='GLB',use_selection=True,export_apply=True,export_cameras=False,export_lights=False,export_normals=True,export_texcoords=False,export_extras=False,export_animations=False,export_yup=True)
 print('nsu_campus_model:',kept,'objects ->',WEB,flush=True);sys.exit(0)
(OUT/'NSU_Shohoj_manifest.json').write_text(json.dumps(manifest,indent=2))
(OUT/'BUILD_VALIDATION.json').write_text(json.dumps(dict(stats=stats,all_materials_present=all(m is not None for o in meshes for m in o.data.materials),packed_texture=bool(im.packed_file),source_reconstruction=True),indent=2))
bpy.ops.object.select_all(action='DESELECT');bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'NSU_Shohoj_Reference_v1.1.blend'),compress=True)
print('BUILD COMPLETE',json.dumps(stats),flush=True)
