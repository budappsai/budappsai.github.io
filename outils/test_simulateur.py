import json,subprocess,sys,random
sys.path.insert(0,'/Users/riquier/CREATA-source')
import os; os.environ['ATELIER_SANS_JETON']='1'
import app as A
random.seed(3); ech=0
for terr,per,acre in [('metropole','courant',False),('metropole','courant',True),('dom','debut',False),('dom','an3',False),('dom','courant',False)]:
    for _ in range(40):
        ca={c:random.choice([0,0,random.randint(0,90000)]) for c in ['vente','service_bic','bnc','bnc_cipav']}
        col='acre' if (terr=='metropole' and acre) else 'metropole' if terr=='metropole' else {'debut':'dom_debut','an3':'dom_an3','courant':'dom'}[per]
        py=A.cotis_micro(ca,col)
        js=json.loads(subprocess.check_output(['node','-e',"""
const s=require('fs').readFileSync('/Users/riquier/SITE-budappsai/simulateurs/cotisations.html','utf8');
const code=s.split('<script>')[1].split('</script>')[0];
const m={exports:{}};new Function('module',code)(m);
console.log(JSON.stringify(m.exports.calcul(%s,'%s','%s',%s)))"""%(json.dumps(ca),terr,per,'true' if acre else 'false')]))['cotis']
        if abs(py-js)>1e-6: print('ECART',ca,terr,per,acre,py,js); ech+=1
print(ech,'ecart(s)'); sys.exit(1 if ech else 0)
