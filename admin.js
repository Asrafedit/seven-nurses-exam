import {
  auth,
  FCM_VAPID_KEY
} from "./firebase-config.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";


const $ = id => document.getElementById(id);

let state = {
  students: [],
  exams: [],
  results: [],
  notifications: []
};


/* =========================================
   SAFE TEXT
   ========================================= */

function esc(value){
  return String(value ?? "")
    .replace(/[&<>"']/g, m => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[m]));
}


/* =========================================
   MESSAGE
   ========================================= */

function msg(text, error = false){

  const el = $("loginMsg");

  if(!el) return;

  el.textContent = text;

  el.style.background =
    error ? "#fee2e2" : "#eff6ff";

  el.style.color =
    error ? "#991b1b" : "#174b8f";
}


/* =========================================
   API
   ========================================= */

async function api(path, options = {}){

  const user = auth.currentUser;

  const token = user
    ? await user.getIdToken(true)
    : "";

  const headers = {
    "Content-Type":"application/json",
    ...(options.headers || {})
  };

  if(token){
    headers.Authorization =
      "Bearer " + token;
  }

  const response = await fetch(
    path,
    {
      ...options,
      headers
    }
  );

  const raw = await response.text();

  let data = {};

  try{
    data = JSON.parse(raw);
  }
  catch{
    data = {
      error: raw || `HTTP ${response.status}`
    };
  }

  if(!response.ok){
    throw new Error(
      data.error ||
      data.message ||
      `HTTP ${response.status}`
    );
  }

  return data;
}


/* =========================================
   ADMIN LOGIN
   ========================================= */

if($("loginBtn")){

  $("loginBtn").onclick = async()=>{

    const email =
      $("email").value.trim();

    const password =
      $("password").value;

    if(!email || !password){

      msg(
        "Email and password required.",
        true
      );

      return;
    }

    const button =
      $("loginBtn");

    button.disabled = true;

    button.textContent =
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
    catch(error){

      msg(
        error.message ||
        "Login failed.",
        true
      );

    }
    finally{

      button.disabled = false;

      button.textContent =
        "Login";

    }

  };

}


/* =========================================
   LOGOUT
   ========================================= */

if($("logout")){

  $("logout").onclick = async()=>{

    await signOut(auth);

  };

}


/* =========================================
   AUTH STATE
   ========================================= */

onAuthStateChanged(
  auth,
  async user=>{

    if(!user){

      if($("loginBox"))
        $("loginBox").hidden = false;

      if($("panel"))
        $("panel").hidden = true;

      if($("logout"))
        $("logout").hidden = true;

      return;
    }

    if($("loginBox"))
      $("loginBox").hidden = true;

    if($("panel"))
      $("panel").hidden = false;

    if($("logout"))
      $("logout").hidden = false;

    try{

      await loadAll();

      await registerPush();

    }
    catch(error){

      console.error(error);

      msg(
        error.message ||
        "Could not load admin panel.",
        true
      );

    }

  }
);


/* =========================================
   LOAD EVERYTHING
   ========================================= */

async function loadAll(){

  const [
    settings,
    students,
    exams,
    results,
    notifications
  ] = await Promise.all([

    api("/api/admin/settings"),

    api("/api/admin/students"),

    api("/api/admin/exams"),

    api("/api/admin/results"),

    api("/api/admin/notifications")

  ]);

  state.students =
    Array.isArray(students)
      ? students
      : [];

  state.exams =
    Array.isArray(exams)
      ? exams
      : [];

  state.results =
    Array.isArray(results)
      ? results
      : [];

  state.notifications =
    Array.isArray(notifications)
      ? notifications
      : [];

  fillSettings(settings);

  renderDashboard();

  renderStudents();

  renderExams();

  renderResults();

  renderNotifications();

  populateExamSelect();

  await loadQuestions();

}


/* =========================================
   SETTINGS
   ========================================= */

function fillSettings(settings){

  const fields = [

    "siteName",
    "headerTitle",
    "subtitle",
    "logoUrl",
    "backgroundUrl",
    "notice",
    "footerText",
    "commonExamPin",

    /*
      যদি admin.html-এ headerColor
      field থাকে তাহলে এটাও কাজ করবে
    */
    "headerColor"

  ];

  fields.forEach(key=>{

    if($(key)){

      $(key).value =
        settings?.[key] ?? "";

    }

  });


  if(
    settings?.logoUrl &&
    $("adminLogo")
  ){

    $("adminLogo").src =
      settings.logoUrl;

    $("adminLogo").style.display =
      "block";

  }

}


/* =========================================
   LOGO UPLOAD
   ========================================= */

if($("adminLogo")){

  $("adminLogo").onclick = ()=>{

    if($("logoFile")){

      $("logoFile").click();

    }

  };

}


if($("logoFile")){

  $("logoFile").onchange = ()=>{

    const file =
      $("logoFile").files?.[0];

    if(!file) return;

    if(
      !file.type.startsWith("image/")
    ){

      alert(
        "Please select an image file."
      );

      return;

    }

    if(
      file.size > 1024 * 1024
    ){

      alert(
        "Logo must be smaller than 1 MB."
      );

      return;

    }

    const reader =
      new FileReader();

    reader.onload = ()=>{

      const data =
        reader.result;

      if($("adminLogo")){

        $("adminLogo").src = data;

        $("adminLogo").style.display =
          "block";

      }

      if($("logoUrl")){

        $("logoUrl").value = data;

      }

    };

    reader.readAsDataURL(file);

  };

}


/* =========================================
   DASHBOARD
   ========================================= */

function renderDashboard(){

  const stats = [

    ["Students", state.students.length],

    ["Exams", state.exams.length],

    ["Results", state.results.length],

    [
      "Notifications",
      state.notifications.length
    ]

  ];


  if($("dashboardStats")){

    $("dashboardStats").innerHTML =
      stats.map(item=>`

        <div class="stat">

          <b>
            ${esc(item[1])}
          </b>

          <span>
            ${esc(item[0])}
          </span>

        </div>

      `).join("");

  }


  if($("dashboardNotifications")){

    $("dashboardNotifications").innerHTML =

      state.notifications
      .slice(0,8)
      .map(n=>`

        <div class="admin-item">

          <div class="admin-item-main">

            <div class="admin-item-title">
              ${esc(
                n.title ||
                "Notification"
              )}
            </div>

            <div class="admin-item-sub">
              ${esc(n.body || "")}
            </div>

          </div>

        </div>

      `)
      .join("")

      ||

      `<div class="empty">
        No notifications.
      </div>`;

  }

}


/* =========================================
   STUDENTS
   ========================================= */

function renderStudents(){

  if(!$("students")) return;

  $("students").innerHTML =

    state.students.map(s=>`

      <div class="admin-item">

        <div class="admin-item-main">

          <div class="admin-item-title">
            ${esc(s.name)}
          </div>

          <div class="admin-item-sub">

            ${
              s.active === false
              ? "Inactive"
              : "Active"
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

    `).join("")

    ||

    `<div class="empty">
      No students.
    </div>`;

}


/* =========================================
   EXAMS
   ========================================= */

function renderExams(){

  if(!$("exams")) return;

  $("exams").innerHTML =

    state.exams.map(e=>{

      const open =
        e.active !== false &&
        e.enabled !== false &&
        e.closed !== true;

      return `

        <div class="admin-item">

          <div class="admin-item-main">

            <div class="admin-item-title">
              ${esc(e.title)}
            </div>

            <div class="admin-item-sub">

              ${esc(e.duration)}
              minutes

              · Pass
              ${esc(e.passMark)}%

              ·

              <b style="
                color:${open ? "#15803d" : "#b91c1c"}
              ">

                ${
                  open
                  ? "OPEN"
                  : "CLOSED"
                }

              </b>

            </div>

          </div>


          <div class="actions">

            <button
              class="btn ${
                open
                ? "btn-red"
                : "btn-green"
              } btn-mini"
              onclick="toggleExam('${esc(e.id)}')"
            >

              ${
                open
                ? "Close"
                : "Open"
              }

            </button>


            <button
              class="btn btn-red btn-mini"
              onclick="deleteExam('${esc(e.id)}')"
            >
              Delete
            </button>

          </div>

        </div>

      `;

    }).join("")

    ||

    `<div class="empty">
      No examinations.
    </div>`;

}


/* =========================================
   OPEN / CLOSE EXAM
   ========================================= */

window.toggleExam = async id=>{

  const exam =
    state.exams.find(
      x => String(x.id) === String(id)
    );

  if(!exam){

    alert("Exam not found.");

    return;

  }

  const currentlyOpen =
    exam.active !== false &&
    exam.enabled !== false &&
    exam.closed !== true;

  const action =
    currentlyOpen
    ? "close"
    : "open";

  if(
    !confirm(
      currentlyOpen
      ? "Close this examination?"
      : "Open this examination?"
    )
  ){

    return;

  }


  try{

    await api(
      "/api/admin/exams/" +
      encodeURIComponent(id) +
      "/status",
      {
        method:"PUT",

        body:JSON.stringify({

          active: !currentlyOpen,

          enabled: !currentlyOpen,

          closed: currentlyOpen

        })

      }
    );


    await loadAll();

  }
  catch(error){

    /*
      যদি backend-এ /status endpoint
      এখনো না থাকে, error দেখাবে।
      তখন server.js-এ endpoint যোগ করতে হবে।
    */

    alert(
      error.message
    );

  }

};


/* =========================================
   DELETE STUDENT
   ========================================= */

window.deleteStudent = async id=>{

  if(
    !confirm(
      "Delete this student?"
    )
  ){

    return;

  }

  try{

    await api(
      "/api/admin/students/" +
      encodeURIComponent(id),
      {
        method:"DELETE"
      }
    );

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   SAVE STUDENT
   ========================================= */

window.saveStudent = async()=>{

  const input =
    $("studentName");

  if(!input) return;

  const name =
    input.value.trim();

  if(!name){

    alert(
      "Enter student name."
    );

    return;

  }

  try{

    await api(
      "/api/admin/students",
      {
        method:"POST",

        body:JSON.stringify({
          name
        })
      }
    );

    input.value = "";

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   SAVE EXAM
   ========================================= */

window.saveExam = async()=>{

  const title =
    $("examTitleInput")
      ?.value
      .trim();

  const duration =
    Number(
      $("examDuration")
        ?.value || 30
    );

  const passMark =
    Number(
      $("examPass")
        ?.value || 40
    );

  if(!title){

    alert(
      "Enter exam title."
    );

    return;

  }

  try{

    await api(
      "/api/admin/exams",
      {
        method:"POST",

        body:JSON.stringify({

          title,

          duration,

          passMark,

          active:true,

          enabled:true,

          closed:false

        })

      }
    );

    if($("examTitleInput"))
      $("examTitleInput").value = "";

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   DELETE EXAM
   ========================================= */

window.deleteExam = async id=>{

  if(
    !confirm(
      "Delete this examination?"
    )
  ){

    return;

  }

  try{

    await api(
      "/api/admin/exams/" +
      encodeURIComponent(id),
      {
        method:"DELETE"
      }
    );

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   EXAM SELECT
   ========================================= */

function populateExamSelect(){

  if(!$("examSelect")) return;

  $("examSelect").innerHTML =

    state.exams.map(e=>`

      <option value="${esc(e.id)}">

        ${esc(e.title)}

      </option>

    `).join("")

    ||

    `<option value="">
      No examination
    </option>`;

}


/* =========================================
   QUESTIONS
   ========================================= */

window.loadQuestions = async()=>{

  if(!$("examSelect")) return;

  const examId =
    $("examSelect").value;

  if(!examId){

    if($("questions")){

      $("questions").innerHTML =
        `<div class="empty">
          Select an examination.
        </div>`;

    }

    return;

  }

  try{

    const response =
      await api(
        "/api/admin/questions/" +
        encodeURIComponent(examId)
      );

    const questions =
      Array.isArray(response)
      ? response
      : response.questions || [];

    if($("questions")){

      $("questions").innerHTML =

        questions.map(q=>{

          const type =
            q.type || "tf";

          return `

            <div class="admin-item">

              <div class="admin-item-main">

                <div class="admin-item-title">

                  Q${esc(q.order || "")}

                  ·

                  ${esc(q.question)}

                </div>

                <div class="admin-item-sub">

                  ${
                    type === "mcq"
                    ? "Multiple Choice"
                    : "True / False"
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

          `;

        }).join("")

        ||

        `<div class="empty">
          No questions.
        </div>`;

    }

  }
  catch(error){

    if($("questions")){

      $("questions").innerHTML =
        `<div class="empty">
          ${esc(error.message)}
        </div>`;

    }

  }

};


/* =========================================
   DELETE QUESTION
   ========================================= */

window.deleteQuestion = async id=>{

  if(
    !confirm(
      "Delete this question?"
    )
  ){

    return;

  }

  try{

    await api(
      "/api/admin/questions/" +
      encodeURIComponent(id),
      {
        method:"DELETE"
      }
    );

    await loadQuestions();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   RESULTS
   ========================================= */

function renderResults(){

  if(!$("results")) return;

  const rows =
    state.results.map(r=>`

      <tr>

        <td>
          ${esc(r.rank || "-")}
        </td>

        <td>
          ${esc(r.studentName)}
        </td>

        <td>
          ${esc(r.examTitle)}
        </td>

        <td>
          ${esc(r.score)}
          /
          ${esc(r.total)}
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

          <button
            class="btn btn-red btn-mini"
            onclick="deleteResult('${esc(r.id)}')"
          >
            Delete
          </button>

        </td>

      </tr>

    `).join("");


  $("results").innerHTML = `

    <table>

      <thead>

        <tr>

          <th>Rank</th>

          <th>Name</th>

          <th>Exam</th>

          <th>Score</th>

          <th>Grade</th>

          <th>Status</th>

          <th>Action</th>

        </tr>

      </thead>

      <tbody>

        ${
          rows ||

          `<tr>

            <td
              colspan="7"
              style="text-align:center"
            >
              No results.
            </td>

          </tr>`

        }

      </tbody>

    </table>

  `;

}


/* =========================================
   DELETE RESULT / HISTORY
   ========================================= */

window.deleteResult = async id=>{

  if(
    !confirm(
      "Delete this result from history?"
    )
  ){

    return;

  }

  try{

    await api(
      "/api/admin/results/" +
      encodeURIComponent(id),
      {
        method:"DELETE"
      }
    );

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   VIEW RESULT
   ========================================= */

window.viewResult = async id=>{

  try{

    const result =
      await api(
        "/api/admin/results/" +
        encodeURIComponent(id)
      );

    const review =
      result.review || [];

    const questions =
      review.map(item=>{

        const options =
          ["A","B","C","D","E"]
          .map(letter=>{

            const option =
              item.options?.[letter] || {};

            let cls = "";

            if(option.correct){
              cls = "correct";
            }

            if(
              option.selected &&
              !option.correct
            ){

              cls = "wrong";

            }

            return `

              <div style="
                margin:5px 0;
                padding:8px;
                border-radius:6px;
                background:${
                  option.correct
                  ? "#dcfce7"
                  : option.selected
                  ? "#fee2e2"
                  : "#f8fafc"
                };
              ">

                <b>${letter}.</b>

                ${esc(option.text || "")}

                ${
                  option.selected
                  ? " — Your Answer"
                  : ""
                }

                ${
                  option.correct
                  ? " — Correct Answer"
                  : ""
                }

              </div>

            `;

          })
          .join("");


        return `

          <div style="
            margin-bottom:15px;
            padding:12px;
            border:1px solid #dce4ef;
            border-radius:9px;
          ">

            <b>
              Q${esc(item.number)}.
              ${esc(item.question)}
            </b>

            <div style="
              margin-top:8px;
            ">

              ${options}

            </div>

          </div>

        `;

      }).join("");


    const popup =
      window.open(
        "",
        "_blank",
        "width=700,height=800"
      );

    if(!popup){

      alert(
        "Please allow popups for this site."
      );

      return;

    }

    popup.document.write(`

      <!DOCTYPE html>

      <html>

      <head>

        <meta charset="UTF-8">

        <title>
          SEVEN NURSES Result
        </title>

        <style>

          body{
            font-family:Arial,sans-serif;
            background:#f3f6fb;
            padding:20px;
            color:#172033;
          }

          .box{
            max-width:650px;
            margin:auto;
            background:white;
            padding:20px;
            border-radius:12px;
          }

          h2{
            color:#1769e0;
          }

        </style>

      </head>

      <body>

        <div class="box">

          <h2>
            SEVEN NURSES
          </h2>

          <b>
            Student:
          </b>

          ${esc(result.studentName)}

          <br><br>

          <b>
            Exam:
          </b>

          ${esc(result.examTitle)}

          <br><br>

          <b>
            Score:
          </b>

          ${esc(result.score)}
          /
          ${esc(result.total)}

          <br><br>

          <b>
            Grade:
          </b>

          ${esc(result.grade)}

          <br><br>

          <b>
            Status:
          </b>

          ${esc(result.status)}

          <hr>

          ${questions}

        </div>

      </body>

      </html>

    `);

    popup.document.close();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   SAVE SETTINGS
   ========================================= */

window.saveSettings = async()=>{

  const fields = [

    "siteName",
    "headerTitle",
    "subtitle",
    "logoUrl",
    "backgroundUrl",
    "notice",
    "footerText",
    "commonExamPin",
    "headerColor"

  ];

  const body = {};

  fields.forEach(key=>{

    if($(key)){

      body[key] =
        $(key).value.trim();

    }

  });


  try{

    await api(
      "/api/admin/settings",
      {
        method:"PUT",
        body:JSON.stringify(body)
      }
    );

    alert(
      "Settings saved successfully."
    );

    await loadAll();

  }
  catch(error){

    alert(error.message);

  }

};


/* =========================================
   CHANGE PASSWORD
   ========================================= */

window.changePassword = async()=>{

  const oldPassword =
    $("oldPass")?.value;

  const newPassword =
    $("newPass")?.value;

  const confirmPassword =
    $("newPass2")?.value;

  const message =
    $("passMsg");


  if(
    !newPassword ||
    newPassword.length < 6
  ){

    if(message){

      message.textContent =
        "New password must be at least 6 characters.";

    }

    return;

  }


  if(
    newPassword !==
    confirmPassword
  ){

    if(message){

      message.textContent =
        "New passwords do not match.";

    }

    return;

  }


  try{

    const credential =
      EmailAuthProvider.credential(
        auth.currentUser.email,
        oldPassword
      );

    await reauthenticateWithCredential(
      auth.currentUser,
      credential
    );

    await updatePassword(
      auth.currentUser,
      newPassword
    );


    if(message){

      message.textContent =
        "Password changed successfully.";

    }


    if($("oldPass"))
      $("oldPass").value = "";

    if($("newPass"))
      $("newPass").value = "";

    if($("newPass2"))
      $("newPass2").value = "";

  }
  catch(error){

    if(message){

      message.textContent =
        error.message ||
        "Password change failed.";

    }

  }

};


/* =========================================
   FCM PUSH
   ========================================= */

async function registerPush(){

  try{

    if(
      !("serviceWorker" in navigator)
    ){

      return;

    }


    const messagingModule =
      await import(
        "https://www.gstatic.com/firebasejs/12.5.0/firebase-messaging.js"
      );


    if(
      !messagingModule.isSupported()
    ){

      return;

    }


    const registration =
      await navigator
        .serviceWorker
        .register(
          "/firebase-messaging-sw.js"
        );


    const messaging =
      messagingModule.getMessaging();


    const token =
      await messagingModule.getToken(
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

          body:JSON.stringify({
            token
          })
        }
      );

    }

  }
  catch(error){

    console.log(
      "FCM skipped:",
      error.message
    );

  }

  }
