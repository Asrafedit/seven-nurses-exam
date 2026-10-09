self.addEventListener(
  "install",
  ()=>{
    self.skipWaiting();
  }
);

self.addEventListener(
  "activate",
  e=>{
    e.waitUntil(
      self.clients.claim()
    );
  }
);

self.addEventListener(
  "push",
  e=>{

    let d={};

    try{

      d=e.data
        ?
        e.data.json()
        :
        {};

    }
    catch(_){}

    e.waitUntil(

      self.registration.showNotification(
        d.title||
        "SEVEN NURSES",
        {
          body:
            d.body||
            "New notification",

          icon:
            d.icon||
            "/favicon.ico",

          data:
            d.data||
            {}
        }
      )

    );

  }
);
