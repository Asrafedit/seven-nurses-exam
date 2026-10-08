self.addEventListener(
"install",
()=>self.skipWaiting()
);

self.addEventListener(
"activate",
e=>e.waitUntil(
self.clients.claim()
)
);

self.addEventListener(
"push",
e=>{

let d={
title:"SEVEN NURSES",
body:"New notification"
};

try{
d=e.data.json();
}
catch{}

e.waitUntil(
self.registration.showNotification(
d.title||"SEVEN NURSES",
{
body:d.body||"",
icon:d.icon||"/favicon.ico"
}
)
);

}
);
