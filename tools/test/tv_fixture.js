const MP={INF:'INFORMATIKA',BIND:'B. INDONESIA',IPS:'IPS',MTK:'MATEMATIKA',IPA:'IPA',BING:'B. INGGRIS',PPKN:'PPKN',PAIBP:'PAIBP',BSUN:'B. SUNDA',PRK:'PRAKARYA',PJOK:'PJOK'};
const KK={INF:[71,73,75],BSUN:[73,75,77],MTK:[71,73,75],IPA:[71,73,75],IPS:[73,75,77],BIND:[73,75,77],PRK:[73,75,77],PAIBP:[73,75,77],PPKN:[73,75,77],PJOK:[73,75,77],BING:[71,73,75]};
const TG={PAIBP:'2026-11-30',BIND:'2026-11-30',MTK:'2026-12-01',BSUN:'2026-12-01',IPA:'2026-12-02',BING:'2026-12-02',PPKN:'2026-12-03',IPS:'2026-12-03'};
const rows=`INF08-ASAS2026A H. Rizal Abdurrahman, S.Pd
BIND09-ASAS2026A Cicih Sukaesih, M.Pd.
BIND07-ASAS2026A Iis Jubaedah, M.Pd.
BIND08-ASAS2026A Eti Suhaeti, S.Pd
IPS07-ASAS2026A Hj. Teti Maryati, S.Pd., MM.
IPS08-ASAS2026A Aan Hasanah, M.Pd.
IPS09-ASAS2026A Diah Hayati, M.Pd.
MTK07-ASAS2026A Ipan Kurniawan, S.Pd.
MTK08-ASAS2026A Santi Sridamayanti, S.Pd.
MTK09-ASAS2026A Wintono, S.Pd.
MTK09-ASAS2026B Suryaka, S.Pd.
IPA09-ASAS2026A Lena Fajar Pasaribu, M.Pd.
IPA08-ASAS2026A Yanti Riyanti, S.Si.
IPA07-ASAS2026A Teti Kuspianti, S.Pd.
IPA08-ASAS2026B Suci Yuniatun, S.Pd.
MTK07-ASAS2026B Suci Yuniatun, S.Pd.
BING09-ASAS2026A Asep Budi, S.Pd.
BING08-ASAS2026A Rizal Nurdimansyah, S.Pd.
BING07-ASAS2026A Rissa Melinda P, S.Pd.
INF07-ASAS2026A Tuti Krisnawati, S.Kom.
INF08-ASAS2026B Omo Sugema, S.Pd.
PPKN09-ASAS2026A Sahudin, S.Pd.
PPKN08-ASAS2026A Sahudin, S.Pd.
PPKN08-ASAS2026B Dede Yusup, S.Pd.
PAIBP09-ASAS2026A Hj. Mimin Kusmiati, M.PdI.
PAIBP08-ASAS2026A Ari Azhari, S.Pd.
PAIBP07-ASAS2026A Hj. Mimin Kusmiati, M.PdI.
PAIBP07-ASAS2026B Ari Azhari, S.Pd.
BSUN09-ASAS2026A H. Kusmayadi, S.Pd.MM.
BSUN07-ASAS2026A Pitradi, S.Pd.
BSUN08-ASAS2026A Pitradi, S.Pd.
INF09-ASAS2026A H. Rizal Abdurrahman, S.Pd
PRK07-ASAS2026A Saeful Hayat, S.Pd.
PRK08-ASAS2026A Saeful Hayat, S.Pd.
PRK08-ASAS2026B N. Imas Rostita, SP, M.Pd.
PRK09-ASAS2026A N. Imas Rostita, SP, M.Pd.
PJOK07-ASAS2026A Dadan Suwandana, S.Pd.
PJOK08-ASAS2026A Dadan Suwandana, S.Pd.
IPS07-ASAS2026B Omo Sugema, S.Pd.
IPA07-ASAS2026B Yanti Riyanti, S.Si.
IPS08-ASAS2026B Omo Sugema, S.Pd.
IPA09-ASAS2026B Suci Yuniatun, S.Pd.
PJOK07-ASAS2026B Ajid Muhamad Yusup, S.Pd.
PJOK09-ASAS2026A Ajid Muhamad Yusup, S.Pd.
BIND08-ASAS2026B Ikah Kartikah, S.Pd.
BIND09-ASAS2026B Ikah Kartikah, S.Pd.
BIND07-ASAS2026B Tia Mutiara, S.Pd.
BIND08-ASAS2026C Tia Mutiara, S.Pd.
PAIBP07-ASAS2026C Iis Jubaedah, M.Pd.
INF08-ASAS2026C Tuti Krisnawati, S.Kom.
BIND07-ASAS2026C Dede Yusup, S.Pd.`.split('\n').map(l=>{const id=l.split(' ')[0],g=l.slice(id.length+1),m=/^([A-Z]+)0(\d)/.exec(id);const c=m[1],t=m[2];
 return {ID:id,'Nama Ujian':'ASAS',Mapel:MP[c],'Tingkat Pendidikan':t,'Nama Rombel':t,Guru:g,Tanggal:TG[c]||(c==='INF'&&!/C$/.test(id)?'2026-11-04':''),Kunci:'AAAABCDABCDAAAABCDAADDACD',KKTP:String(KK[c][t-7]),Status:'Aktif'}});
const cnt={"7|7A":29,"7|7B":28,"7|7C":29,"7|7D":30,"7|7E":27,"7|7F":28,"7|7G":26,"8|8A":28,"8|8B":28,"8|8C":28,"8|8D":27,"8|8E":28,"8|8F":28,"9|9A":32,"9|9B":32,"9|9C":31,"9|9D":30,"9|9E":29,"9|9F":30};
const siswa=[];for(const k in cnt){const [t,r]=k.split('|');for(let i=0;i<cnt[k];i++)siswa.push({Nama:'S'+r+i,'Tingkat Pendidikan':t,'Nama Rombel':r});}
const H=["2026-11-16 11:32:15|INF08-ASAS2026A|8A|s011|36","2026-11-16 11:46:26|IPS09-ASAS2026A|9A|s111|36","2026-11-16 12:01:27|IPS09-ASAS2026A|9C|s211|36","2026-11-16 12:03:19|IPS08-ASAS2026A|8A|s311|36","2026-11-16 12:16:47|BIND09-ASAS2026A|9A|s411|24","2026-11-16 12:18:20|BIND09-ASAS2026A|9A|s511|36","2026-11-16 13:09:24|BIND09-ASAS2026A|9A|s611|36","2026-11-16 13:11:00|BSUN09-ASAS2026A|9A|s711|36","2026-11-16 14:42:49|INF08-ASAS2026A|8A|s811|36","2026-11-16 15:09:51|BIND09-ASAS2026A|9A|s911|20","2026-11-16 15:13:59|BIND09-ASAS2026A|9A|s1011|36","2026-11-16 15:15:17|BIND09-ASAS2026A|9A|s1111|20","2026-11-16 15:25:08|INF09-ASAS2026A|9A|s1211|28","2026-11-16 15:25:53|INF09-ASAS2026A|9A|s1311|20","2026-11-27 10:22:04|INF08-ASAS2026A|8A|s1411|16"].map(s=>{const [w,id,rb,n,sk]=s.split('|');return {Waktu:w,'ID Ujian':id,'Nama Rombel':rb,NISN:'',Nama:n,Skor:sk}});
// simulasi hari ujian ke-3 (2 Des): sebagian besar kelas sudah dipindai untuk mapel yang lewat
function simulasi(){const out=H.slice();let s=1;const rnd=()=>(s=(s*16807)%2147483647)/2147483647;const lewat=['PAIBP','B. INDONESIA','MATEMATIKA','B. SUNDA','IPA'];
 rows.forEach((u,ui)=>{if(lewat.indexOf(u.Mapel)<0||/B$|C$/.test(u.ID)&&rnd()<.5)return;const rbs=Object.keys(cnt).filter(k=>k[0]===u['Tingkat Pendidikan']).map(k=>k.split('|')[1]);
  rbs.forEach(rb=>{const n=cnt[u['Tingkat Pendidikan']+'|'+rb];const frac=u.Mapel==='IPA'?rnd()*.6:rnd()<.6?1:rnd();for(let i=0;i<Math.floor(n*frac*(/A$/.test(u.ID)?1:0));i++)out.push({Waktu:'2026-12-02 '+String(7+Math.floor(rnd()*4)).padStart(2,'0')+':'+String(Math.floor(rnd()*60)).padStart(2,'0')+':00','ID Ujian':u.ID,'Nama Rombel':rb,NISN:'',Nama:rb+'-'+i,Skor:String(Math.round(40+rnd()*60))})})});
 return out;}
module.exports={ujian:rows,siswa,hasil:H,hasilSim:simulasi(),sekolah:{'Nama Sekolah':'SMPN 2 Jalaksana','Tahun Pelajaran':'2026-2027'}};
