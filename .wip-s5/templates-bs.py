# edita os templates (button, surface, radio-button, switch) para ler os campos importados
import json,copy
D='/home/user/mapping/libraries/material3-compose/components/'
def load(n): return json.load(open(D+n+'.json'))
def save(n,t): json.dump(t,open(D+n+'.json','w'),ensure_ascii=False,indent=2); open(D+n+'.json','a').write('\n')
COLORS=None
dv=load('divider')
def find(n,pred,acc):
    if isinstance(n,dict):
        if pred(n): acc.append(n)
        for c in n.get('children') or []: find(c,pred,acc)
a=[];find(dv['template'],lambda n:n.get('name')=='linha',a)
COLORS=a[0]['fill']['cases']
def SW(field,old): return {"$switch":field,"cases":copy.deepcopy(COLORS),"default":old}
def nodes(t,name,typ=None):
    a=[];find(t['template'],lambda n:n.get('name')==name and (typ is None or n.get('type')==typ),a);return a
DIS={"$eq":["enabled","false"]}
# ---- button
t=load('button')
SHAPE={"$switch":"shape","cases":{"none":{"$token":"corner-none"},"extraSmall":{"$token":"corner-extra-small"},"small":{"$token":"corner-small"},"medium":{"$token":"corner-medium"},"large":{"$token":"corner-large"},"extraLarge":{"$token":"corner-extra-large"}},"default":{"$token":"corner-full"}}
for nm in ['sombra elevada','container','contorno','estado']:
    for n in nodes(t,nm,'rect'): n['cornerRadius']=copy.deepcopy(SHAPE)
c=nodes(t,'container','rect')[0]
f=c['fill']; assert f['$if']==DIS
f['then']=SW('disabledContainerColor',f['then']); f['else']=SW('containerColor',f['else'])
o=c['opacity']; assert o['$if']==DIS
o['then']={"$if":{"$has":"disabledContainerColor"},"then":1,"else":o['then']}
for n in nodes(t,'rótulo','text')+[x for x in nodes(t,'conteúdo','frame')[0]['children'] if x.get('type')=='icon']:
    col=n['color']; assert col['$if']==DIS
    col['then']=SW('disabledContentColor',col['then']); col['else']=SW('contentColor',col['else'])
cont=nodes(t,'conteúdo','frame')[0]
old=cont['layout']['padding']
HAS={"$or":[{"$has":"horizontal"},{"$has":"vertical"}]}
H={"$field":"horizontal","default":24}
V={"$field":"vertical","default":8}
cont['layout']['padding']={"$if":HAS,"then":0,"else":old}
def spacer(name):
    return {"type":"frame","name":name,"visible":HAS,"width":{"$max":[0,{"$sub":[H,8]}]},"height":{"$add":[{"$mul":[V,2]},24]},"children":[]}
cont['children']=[spacer('recuo inicial')]+cont['children']+[spacer('recuo final')]
save('button',t)
# ---- surface
t=load('surface')
r=t['template']
E={"$field":"shadowElevation","default":0}
r['stroke']={"color":{"$if":{"$gt":[{"$field":"borderWidth","default":0},0]},"then":SW('borderColor',{"$token":"outline"}),"else":"none"},"width":{"$field":"borderWidth","default":0},"align":"inside"}
LV=[(0,2),(2,4),(4,7),(7,10),(10,None)]
shadows=[]
for i,(lo,hi) in enumerate(LV,1):
    cond=[{"$gt":[E,0]} if lo==0 else {"$gte":[E,lo]}]
    if hi is not None: cond.append({"$lt":[E,hi]})
    shadows.append({"type":"rect","name":f"sombra nível {i}","fill":copy.deepcopy(r['fill']),"cornerRadius":copy.deepcopy(r['cornerRadius']),
      "anchors":{"left":0,"right":0,"top":0,"bottom":0},"visible":{"$and":cond},
      "shadow":[{"color":{"$token":"elevation-point-shadow"},"y":{"$token":f"elevation-{i}-point-y"},"blur":{"$token":f"elevation-{i}-point-blur"},"spread":{"$token":f"elevation-{i}-point-spread"}},
                {"color":{"$token":"elevation-ambient-shadow"},"y":{"$token":f"elevation-{i}-ambient-y"},"blur":{"$token":f"elevation-{i}-ambient-blur"},"spread":{"$token":f"elevation-{i}-ambient-spread"}}]})
r['children']=shadows+r['children']
save('surface',t)
