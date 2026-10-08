let boot=null,
questions=[],
answers={},
exam=null,
student=null,
timerId=null,
seconds=0,
submitted=false;

async function init(){
try{
boot=await api("/api/bootstrap");
applyBoot(boot);
await loadExams();
}catch(e){
toast(e.message);
}
}

function applyBoot(b){
const s=b.settings||{};

$("siteTitle").textContent=s.siteName||s.headerTitle||"SEVEN NURSES";
$("siteSub").textContent=s.subtitle||"ONLINE EXAM SYSTEM";

$("notice").textContent=s.notice||"";
$("notice").classList.toggle("hidden",!s.notice);

$("footer").textContent=s.footerText||"SEVEN NURSES";

if(s.logoUrl){
$("logo").src=s.logoUrl;
$("logo").style.display="block";
}

if(s.backgroundUrl)
document.body.style.backgroundImage=`url(${s.backgroundUrl})`;
}

async function loadExams(){
const d=await api("/api/student/exams");
const list=d.exams||[];

$("examSelect").innerHTML=
list
.filter(x=>x.active!==false)
.map(x=>`<option value="${esc(x.id)}">${esc(x.title||x.name||x.id)}</option>`)
.join("")
||"<option value=''>No active examination</option>";
}

async function studentLogin(){

const name=$("studentName").value.trim();
const pin=$("pin").value.trim();
const examId=$("examSelect").value;

if(!name||!pin||!examId)
return toast("নাম, PIN এবং পরীক্ষা নির্বাচন করুন।");

try{

const d=await api("/api/student/login",{
method:"POST",
body:JSON.stringify({
name,
pin
})
});

localStorage.setItem("sn_student_token",d.token||"");
localStorage.setItem(
"sn_student",
JSON.stringify(d.student||{name})
);

student=d.student||{name};

await startExam(examId);

}catch(e){
toast(e.message);
}
}

async function startExam(id){

const d=await api(
"/api/student/exams/"+encodeURIComponent(id)+"/questions"
);

exam=d.exam||{
id,
title:id,
duration:d.duration
};

questions=d.questions||[];

if(!questions.length)
return toast("এই পরীক্ষায় কোনো প্রশ্ন নেই।");

answers={};
submitted=false;

$("login").classList.add("hidden");
$("exam").classList.remove("hidden");

$("examName").textContent=
exam.title||exam.name||"Examination";

renderQuestions();

startTimer(
Number(
exam.duration||
exam.timeLimit||
questions.length
)
);
}

function renderQuestions(){

$("questions").innerHTML=questions.map((q,i)=>{

const opts=q.options||{};

return `
<div class="question-box">

<div class="question-title">
Q${i+1}. ${esc(q.question||q.title||"")}
<span class="badge">1 Mark</span>
</div>

${["A","B","C","D","E"].map(k=>`

<div class="statement">

<div class="statement-text">
<b>${k}.</b>
${esc(opts[k]?.text||opts[k]||"")}
</div>

<div class="tf-actions">

<label>
<input
type="radio"
name="q${i}_${k}"
value="true"
onchange="setAns(${i},'${k}',true)">
<span>TRUE</span>
</label>

<label>
<input
type="radio"
name="q${i}_${k}"
value="false"
onchange="setAns(${i},'${k}',false)">
<span>FALSE</span>
</label>

</div>

</div>

`).join("")}

</div>
`;

}).join("");
}

function setAns(i,k,v){

if(!answers[i])
answers[i]={};

answers[i][k]=v;
}

function startTimer(v){

clearInterval(timerId);

seconds=v*60;

paintTimer();

timerId=setInterval(()=>{

seconds--;

paintTimer();

if(seconds<=0){
clearInterval(timerId);
submitExam(true);
}

},1000);
}

function paintTimer(){

const m=Math.floor(seconds/60);
const s=seconds%60;

$("timer").textContent=
String(m).padStart(2,"0")+":"+
String(s).padStart(2,"0");

$("timer").classList.remove("hidden");
}

async function submitExam(auto){

if(submitted)
return;

if(!auto&&!confirm("পরীক্ষা Submit করবেন?"))
return;

submitted=true;

clearInterval(timerId);

try{

const d=await api("/api/student/submit",{
method:"POST",
body:JSON.stringify({
examId:exam.id,
answers
})
});

showResult(d.result||d);

}catch(e){

submitted=false;
toast(e.message);
}
}

function showResult(r){

$("timer").classList.add("hidden");

$("exam").classList.add("hidden");

$("result").classList.remove("hidden");

const review=r.review||[];

$("result").innerHTML=`

<div class="card result-hero">

<h2>Examination Result</h2>

<div class="score">
${esc(r.score??0)} / ${esc(r.total??questions.length)}
</div>

<div class="${
r.status==="PASS"
?"status-pass"
:"status-fail"
}">
${esc(r.status||"")}
</div>

<div class="stat-grid">

<div class="stat">
<b>${esc(r.percentage??0)}%</b>
Percentage
</div>

<div class="stat">
<b>${esc(r.grade||"-")}</b>
Grade
</div>

<div class="stat">
<b>${esc(r.passMark??"-")}</b>
Pass Mark
</div>

<div class="stat">
<b>${esc(r.rank??"-")}</b>
Rank
</div>

</div>

</div>

<div class="card">

<b>Student:</b>
${esc(r.studentName||student?.name)}
<br>

<b>Total Examinees:</b>
${esc(r.totalExaminees??"-")}
<br>

<b>Exam:</b>
${esc(r.examTitle||exam.title||"")}

</div>

<div class="card">

<h3>Answer Review</h3>

${review.map((x,i)=>`

<div class="statement ${
x.correct
?"review-ok"
:x.answered===false
?"review-none"
:"review-bad"
}">

<b>Q${i+1}.</b>
${esc(x.question||"")}

<br>

<span class="small">

Your answers:
${esc(formatAnswers(x.selected))}

<br>

Correct:
${esc(formatAnswers(x.correctAnswers))}

</span>

</div>

`).join("")}

</div>

<button
class="btn btn-blue"
onclick="location.href='/'">
Back to Student Login
</button>

`;
}

function formatAnswers(x){

if(!x)
return "Not answered";

return Object.entries(x)
.map(([k,v])=>k+":"+(v?"TRUE":"FALSE"))
.join("  ");
}

init();
