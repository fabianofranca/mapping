# acrescenta a chave do slot anulável ao fieldModels e os slots de ícone/outro conteúdo ao ignore (base e casos)
import json,sys
root=sys.argv[1]
f=root+'/material3-compose.spec.json'
s=json.load(open(f))
KEY='@Composable (() -> Unit)?'
s['fieldModels']['compose'][KEY]={'type':'string','format':'{ Text("{value}") }'}
IGN={'leadingIcon','trailingIcon','icon','avatar','dragHandle','dismissAction','sheetDragHandle','topBar','header','floatingActionButton','leadingContent','action'}
def add(scope,rid):
    sig=json.load(open(f'{root}/signatures/{rid}.compose.json'))
    names=[p['name'] for p in sig['params'] if p['type']==KEY and p['name'] in IGN]
    ig=list(scope.get('ignore') or [])
    for n in names:
        if n not in ig: ig.append(n)
    if ig: scope['ignore']=ig
for l in s['layers']:
    for t in l['annotationTypes']:
        c=t['code']['compose']
        add(c,t['id'])
        for case,cs in ((c.get('variants') or {}).get('cases') or {}).items():
            add(cs,t['id']+'.'+case)
json.dump(s,open(f,'w'),ensure_ascii=False,indent=2); open(f,'a').write('\n')
