import {
  auth,
  FCM_VAPID_KEY
}
from "./firebase-config.js";


import {

  signInWithEmailAndPassword,

  signOut,

  onAuthStateChanged,

  reauthenticateWithCredential,

  EmailAuthProvider,

  updatePassword

}
from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";


const $=
  id=>document.getElementById(id);


function esc(v){

  return String(v??"")
    .replace(
      /[&<>"']/g,
      m=>({

        "&":"&amp;",
        "<":"&lt;",
        ">":"&gt;",
        '"':"&quot;",
        "'":"&#039;"

      }[m])
    );

}


function msg(
  text,
  error=false
){

  const el=$("loginMsg");

  if(!el)return;

  el.textContent=text;

  el.style.background=
    error
    ?
    "#fff3f4"
    :
    "#f4f8fb";

  el.style.color=
    error
    ?
    "#b4232d"
    :
    "#315a78";

}


async function api(
  path,
  opt={}
){

  const u=
    auth.currentUser;

  const token=
    u
    ?
    await u.getIdToken(true)
    :
    "";

  const headers={
    "Content-Type":
      "application/json",

    ...(opt.headers||{})
  };

  if(token){

    headers.Authorization=
      "Bearer "+token;

  }

  const r=
    await fetch(
      path,
      {
        ...opt,
        headers
      }
    );


  const raw=
    await r.text();


  let data={};


  try{

    data=
      JSON.parse(raw);

  }
  catch{

    data={
      error:
        raw||
        ("HTTP "+r.status)
    };

  }


  if(!r.ok){

    throw new Error(
      data.error||
      data.message||
      ("HTTP "+r.status)
    );

  }


  return data;

}


let state={
  exams:[],
  students:[],
  results:[],
  notifications:[]
};


$("loginBtn").onclick=
  async()=>{

    const email=
      $("email")
        .value
        .trim();

    const password=
      $("password")
        .value;


    if(
      !email||
      !password
    ){

      return msg(
        "Email এবং Password দিন।",
        true
      );

    }


    const btn=
      $("loginBtn");


    btn.disabled=true;

    btn.textContent=
      "Signing in...";


    try{

      await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      msg(
        "Login successful."
      );

    }
    catch(e){

      msg(
        e.message||
        "Login failed",
        true
      );

    }
    finally{

      btn.disabled=false;

      btn.textContent=
        "Login";

    }

  };


$("logout").onclick=
  ()=>signOut(auth);


onAuthStateChanged(
  auth,
  async user=>{

    if(!user){

      $("loginBox")
        .hidden=false;

      $("panel")
        .hidden=true;

      $("logout")
        .hidden=true;

      return;

    }


    $("loginBox")
      .hidden=true;

    $("panel")
      .hidden=false;

    $("logout")
      .hidden=false;


    try{

      await loadAll();

      await registerPush();

    }
    catch(e){

      msg(
        e.message,
        true
      );

    }

  }
);


async function loadAll(){

  const [
    settings,
    students,
    exams,
    results,
    notifications
  ]=
    await Promise.all([

      api(
        "/api/admin/settings"
      ),

      api(
        "/api/admin/students"
      ),

      api(
        "/api/admin/exams"
      ),

      api(
        "/api/admin/results"
      ),

      api(
        "/api/admin/notifications"
      )

    ]);


  state={
    students,
    exams,
    results,
    notifications
  };


  fillSettings(settings);

  renderStudents();

  renderExams();

  renderResults();

  renderNotifications();

  renderDashboard();

  populateExamSelect();

  await loadQuestions();

}


function fillSettings(s){

  for(
    const k
    of [
      "siteName",
      "headerTitle",
      "subtitle",
      "logoUrl",
      "backgroundUrl",
      "notice",
      "footerText",
      "commonExamPin"
    ]
  ){

    if($(k)){

      $(k).value=
        s?.[k]??"";

    }

  }

}


function renderDashboard(){

  const stats=[

    [
      "Students",
      state.students.length
    ],

    [
      "Exams",
      state.exams.length
    ],

    [
      "Results",
      state.results.length
    ],

    [
      "Notifications",
      state.notifications.length
    ]

  ];


  $("dashboardStats")
    .innerHTML=
      stats
      .map(
        x=>`

          <div class="stat">

            <b>
              ${esc(x[1])}
            </b>

            <span>
              ${x[0]}
            </span>

          </div>

        `
      )
      .join("");


  $("dashboardNotifications")
    .innerHTML=
      state.notifications
      .slice(0,8)
      .map(
        n=>`

          <div class="admin-item">

            <div class="admin-item-main">

              <div class="admin-item-title">
                ${esc(
                  n.title||
                  "New Notification"
                )}
              </div>

              <div class="admin-item-sub">
                ${esc(
                  n.body||
                  ""
                )}
              </div>

            </div>

          </div>

        `
      )
      .join("")
      ||
      '<div class="empty">No notifications.</div>';

}


function renderStudents(){

  $("students")
    .innerHTML=
      state.students
      .map(
        s=>`

          <div class="admin-item">

            <div class="admin-item-main">

              <div class="admin-item-title">
                ${esc(s.name)}
              </div>

              <div class="admin-item-sub">
                ${
                  s.active===false
                  ?
                  "Inactive"
                  :
                  "Active"
                }
              </div>

            </div>

            <button
              class="btn btn-red btn-mini"
              onclick="deleteStudent('${esc(s.id)}')"
            >
              Delete
            </button>

          </div>

        `
      )
      .join("")
      ||
      '<div class="empty">No students.</div>';

}


function renderExams(){

  $("exams")
    .innerHTML=
      state.exams
      .map(
        e=>`

          <div class="admin-item">

            <div class="admin-item-main">

              <div class="admin-item-title">
                ${esc(e.title)}
              </div>

              <div class="admin-item-sub">
                ${esc(e.duration)}
                minutes · Pass
                ${esc(e.passMark)}%
              </div>

            </div>

            <button
              class="btn btn-red btn-mini"
              onclick="deleteExam('${esc(e.id)}')"
            >
              Delete
            </button>

          </div>

        `
      )
      .join("")
      ||
      '<div class="empty">No examinations.</div>';

}


function renderResults(){

  const rows=
    state.results
    .map(
      r=>`

        <tr>

          <td>
            ${esc(r.rank||"-")}
          </td>

          <td>
            ${esc(r.studentName)}
          </td>

          <td>
            ${esc(r.examTitle)}
          </td>

          <td>
            ${esc(r.score)}/${esc(r.total)}
          </td>

          <td>
            ${esc(r.grade)}
          </td>

          <td>
            ${esc(r.status)}
          </td>

          <td>

            <button
              class="btn btn-blue btn-mini"
              onclick="viewResult('${esc(r.id)}')"
            >
              View
            </button>

          </td>

        </tr>

      `
    )
    .join("");


  $("results")
    .innerHTML=`

      <table>

        <thead>

          <tr>

            <th>Rank</th>
            <th>Name</th>
            <th>Exam</th>
            <th>Score</th>
            <th>Grade</th>
            <th>Status</th>
            <th></th>

          </tr>

        </thead>

        <tbody>

          ${
            rows||
            `
              <tr>
                <td colspan="7">
                  No results.
                </td>
              </tr>
            `
          }

        </tbody>

      </table>

    `;

}


function renderNotifications(){

  $("notifications")
    .innerHTML=
      state.notifications
      .map(
        n=>`

          <div class="admin-item">

            <div class="admin-item-main">

              <div class="admin-item-title">
                ${esc(
                  n.title||
                  "Submission"
                )}
              </div>

              <div class="admin-item-sub">
                ${esc(
                  n.body||
                  ""
                )}
              </div>

            </div>

          </div>

        `
      )
      .join("")
      ||
      '<div class="empty">No notifications.</div>';

}


function populateExamSelect(){

  $("examSelect")
    .innerHTML=
      state.exams
      .map(
        e=>`

          <option
            value="${esc(e.id)}"
          >
            ${esc(e.title)}
          </option>

        `
      )
      .join("")
      ||
      '<option value="">No examination</option>';

}


window.saveStudent=
  async()=>{

    const name=
      $("studentName")
      .value
      .trim();


    if(!name){

      return alert(
        "Student name দিন।"
      );

    }


    try{

      await api(
        "/api/admin/students",
        {
          method:"POST",

          body:
            JSON.stringify({
              name
            })
        }
      );


      $("studentName")
        .value="";


      await loadAll();

    }
    catch(e){

      alert(e.message);

    }

  };


window.deleteStudent=
  async id=>{

    if(
      !confirm(
        "এই student delete করবেন?"
      )
    ){
      return;
    }


    try{

      await api(
        "/api/admin/students/"
        +encodeURIComponent(id),
        {
          method:"DELETE"
        }
      );

      await loadAll();

    }
    catch(e){

      alert(e.message);

    }

  };


window.saveExam=
  async()=>{

    const title=
      $("examTitleInput")
      .value
      .trim();

    const duration=
      Number(
        $("examDuration")
        .value||
        30
      );

    const passMark=
      Number(
        $("examPass")
        .value||
        40
      );


    if(!title){

      return alert(
        "Exam title দিন।"
      );

    }


    try{

      await api(
        "/api/admin/exams",
        {
          method:"POST",

          body:
            JSON.stringify({
              title,
              duration,
              passMark
            })
        }
      );


      $("examTitleInput")
        .value="";


      await loadAll();

    }
    catch(e){

      alert(e.message);

    }

  };


window.deleteExam=
  async id=>{

    if(
      !confirm(
        "এই examination delete করবেন?"
      )
    ){
      return;
    }


    try{

      await api(
        "/api/admin/exams/"
        +encodeURIComponent(id),
        {
          method:"DELETE"
        }
      );

      await loadAll();

    }
    catch(e){

      alert(e.message);

    }

  };


window.loadQuestions=
  async()=>{

    const id=
      $("examSelect").value;


    if(!id){

      $("questionForm")
        .innerHTML="";

      $("questions")
        .innerHTML=
          '<div class="empty">Select an examination.</div>';

      return;

    }


    try{

      const qs=
        await api(
          "/api/admin/questions/"
          +encodeURIComponent(id)
        );


      const arr=
        Array.isArray(qs)
        ?
        qs
        :
        (
          qs.questions||
          []
        );


      $("questions")
        .innerHTML=
          arr
          .map(
            q=>`

              <div class="admin-item">

                <div class="admin-item-main">

                  <div class="admin-item-title">

                    Q${esc(q.order||"")}
                    ·
                    ${esc(q.question)}

                  </div>

                  <div class="admin-item-sub">

                    A:
                    ${
                      q.options?.A?.correct
                      ?
                      "TRUE"
                      :
                      "FALSE"
                    }

                    ·

                    B:
                    ${
                      q.options?.B?.correct
                      ?
                      "TRUE"
                      :
                      "FALSE"
                    }

                    ·

                    C:
                    ${
                      q.options?.C?.correct
                      ?
                      "TRUE"
                      :
                      "FALSE"
                    }

                    ·

                    D:
                    ${
                      q.options?.D?.correct
                      ?
                      "TRUE"
                      :
                      "FALSE"
                    }

                    ·

                    E:
                    ${
                      q.options?.E?.correct
                      ?
                      "TRUE"
                      :
                      "FALSE"
                    }

                  </div>

                </div>


                <button
                  class="btn btn-red btn-mini"
                  onclick="deleteQuestion('${esc(q.id)}')"
                >
                  Delete
                </button>

              </div>

            `
          )
          .join("")
          ||
          '<div class="empty">No questions.</div>';


      const next=
        arr.length+1;


      $("questionForm")
        .innerHTML=`

          <h3>
            Add 5-Statement Question
          </h3>


          <input
            id="qtext"
            placeholder="Question"
          >


          <input
            id="qimage"
            placeholder="Image URL (optional)"
          >


          ${
            ["A","B","C","D","E"]
            .map(
              k=>`

                <div class="form-grid">

                  <input
                    id="t${k}"
                    class="full"
                    placeholder="Statement ${k}"
                  >

                  <select id="c${k}">

                    <option value="true">
                      TRUE
                    </option>

                    <option value="false">
                      FALSE
                    </option>

                  </select>

                </div>

              `
            )
            .join("")
          }


          <input
            id="qorder"
            type="number"
            min="1"
            value="${next}"
            placeholder="Order"
          >


          <button
            class="btn btn-green"
            onclick="saveQuestion()"
          >
            Add Question
          </button>

        `;

    }
    catch(e){

      $("questions")
        .innerHTML=
          `
            <div class="empty">
              ${esc(e.message)}
            </div>
          `;

    }

  };


window.saveQuestion=
  async()=>{

    const examId=
      $("examSelect").value;


    const options={};


    for(
      const k
      of ["A","B","C","D","E"]
    ){

      options[k]={
        text:
          $("t"+k)
          .value
          .trim(),

        correct:
          $("c"+k)
          .value==="true"
      };

    }


    if(
      !$("qtext")
      .value
      .trim()||
      Object.values(options)
        .some(
          x=>!x.text
        )
    ){

      return alert(
        "Question এবং A-E সব Statement পূরণ করুন।"
      );

    }


    try{

      await api(
        "/api/admin/questions",
        {
          method:"POST",

          body:
            JSON.stringify({

              examId,

              question:
                $("qtext")
                .value
                .trim(),

              imageUrl:
                $("qimage")
                .value
                .trim(),

              order:
                Number(
                  $("qorder")
                  .value||
                  1
                ),

              options

            })
        }
      );


      await loadQuestions();

    }
    catch(e){

      alert(e.message);

    }

  };


window.deleteQuestion=
  async id=>{

    if(
      !confirm(
        "এই question delete করবেন?"
      )
    ){
      return;
    }


    try{

      await api(
        "/api/admin/questions/"
        +encodeURIComponent(id),
        {
          method:"DELETE"
        }
      );


      await loadQuestions();

    }
    catch(e){

      alert(e.message);

    }

  };


window.viewResult=
  async id=>{

    try{

      const r=
        await api(
          "/api/admin/results/"
          +encodeURIComponent(id)
        );


      const review=
        r.review||[];


      const html=
        review
        .map(
          x=>`

            <div
              style="
                border:1px solid #ddd;
                border-radius:7px;
                padding:8px;
                margin:7px 0
              "
            >

              <b>
                Q${esc(x.number)}.
                ${esc(x.question)}
              </b>


              ${
                ["A","B","C","D","E"]
                .map(
                  k=>{

                    const o=
                      x.options?.[k]||
                      {};

                    return `

                      <div
                        style="
                          font-size:11px;
                          margin-top:4px
                        "
                      >

                        ${k}.
                        ${esc(o.text)}

                        —
                        Selected:
                        ${
                          o.selected
                          ?
                          "TRUE"
                          :
                          "FALSE"
                        },

                        Correct:
                        ${
                          o.correct
                          ?
                          "TRUE"
                          :
                          "FALSE"
                        }

                      </div>

                    `;

                  }
                )
                .join("")
              }

            </div>

          `
        )
        .join("");


      const box=
        window.open(
          "",
          "_blank",
          "width=600,height=750"
        );


      box.document.write(`

        <html>

        <head>

          <title>
            SEVEN NURSES Result
          </title>

          <style>

            body{
              font-family:Arial;
              padding:16px
            }

            h2{
              color:#0056b3
            }

          </style>

        </head>

        <body>

          <h2>
            SEVEN NURSES
          </h2>


          <b>Student:</b>
          ${esc(r.studentName)}

          <br>


          <b>Exam:</b>
          ${esc(r.examTitle)}

          <br>


          <b>Score:</b>
          ${esc(r.score)}
          /
          ${esc(r.total)}

          ·
          ${esc(r.grade)}

          ·
          ${esc(r.status)}

          ·
          Rank
          ${esc(r.rank||"-")}

          <hr>

          ${html}

        </body>

        </html>

      `);


      box.document.close();

    }
    catch(e){

      alert(e.message);

    }

  };


window.saveSettings=
  async()=>{

    const b={};


    for(
      const k
      of [
        "siteName",
        "headerTitle",
        "subtitle",
        "logoUrl",
        "backgroundUrl",
        "notice",
        "footerText",
        "commonExamPin"
      ]
    ){

      b[k]=
        $(k)
        .value
        .trim();

    }


    try{

      await api(
        "/api/admin/settings",
        {
          method:"PUT",

          body:
            JSON.stringify(b)
        }
      );


      alert(
        "Settings saved."
      );


      await loadAll();

    }
    catch(e){

      alert(e.message);

    }

  };


window.changePassword=
  async()=>{

    const oldP=
      $("oldPass").value;

    const newP=
      $("newPass").value;

    const newP2=
      $("newPass2").value;


    if(newP.length<6){

      return $(
        "passMsg"
      ).textContent=
        "New password must be at least 6 characters.";

    }


    if(newP!==newP2){

      return $(
        "passMsg"
      ).textContent=
        "New passwords do not match.";

    }


    try{

      const cred=
        EmailAuthProvider.credential(
          auth.currentUser.email,
          oldP
        );


      await reauthenticateWithCredential(
        auth.currentUser,
        cred
      );


      await updatePassword(
        auth.currentUser,
        newP
      );


      $("passMsg")
        .textContent=
          "Password changed successfully.";


      $("oldPass").value=
      $("newPass").value=
      $("newPass2").value="";

    }
    catch(e){

      $("passMsg")
        .textContent=
          e.message||
          "Password change failed.";

    }

  };


async function registerPush(){

  try{

    if(
      !("serviceWorker" in navigator)
    ){
      return;
    }


    const mod=
      await import(
        "https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging.js"
      );


    if(
      !mod.isSupported()
    ){
      return;
    }


    const registration=
      await navigator
        .serviceWorker
        .register(
          "/firebase-messaging-sw.js"
        );


    const messaging=
      mod.getMessaging();


    const token=
      await mod.getToken(
        messaging,
        {
          vapidKey:
            FCM_VAPID_KEY,

          serviceWorkerRegistration:
            registration
        }
      );


    if(token){

      await api(
        "/api/admin/fcm-token",
        {
          method:"POST",

          body:
            JSON.stringify({
              token
            })
        }
      );

    }

  }
  catch(e){

    console.log(
      "FCM skipped:",
      e.message
    );

  }

        }
