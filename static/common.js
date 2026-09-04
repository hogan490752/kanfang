// 看房对比 · 前端公共逻辑（口令 + 数据获取）
(function () {
  "use strict";

  var PW_KEY = "house_pw";

  window.HouseApp = {
    getPassword: function () {
      try { return localStorage.getItem(PW_KEY) || ""; } catch (e) { return ""; }
    },
    setPassword: function (pw) {
      try { localStorage.setItem(PW_KEY, pw); } catch (e) {}
    },
    /** 拉取房源数据；需要口令时弹出遮罩，成功后回调 cb(houses) */
    loadHouses: function (cb) {
      fetch("/api/houses", { headers: { "X-Site-Password": this.getPassword() } })
        .then(function (r) {
          if (r.status === 401) { showGate(function () { window.HouseApp.loadHouses(cb); }); return null; }
          return r.json();
        })
        .then(function (data) {
          if (data) cb(data.houses || []);
        })
        .catch(function () { cb([]); });
    },
    esc: function (s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    },
    /** 把优缺点文本按换行拆成要点，并去掉开头的“优点：/缺点：”引导词 */
    splitPoints: function (text) {
      var arr = String(text == null ? "" : text).split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      return arr.map(function (s) { return s.replace(/^(优点|缺点)[：;；:,\s]*/, ""); });
    },
    fmtSize: function (n) {
      if (!n) return "";
      if (n > 1024 * 1024 * 1024) return (n / 1073741824).toFixed(2) + " GB";
      if (n > 1024 * 1024) return (n / 1048576).toFixed(1) + " MB";
      return Math.round(n / 1024) + " KB";
    }
  };

  function showGate(onOk) {
    // 防止重复弹
    if (document.querySelector(".gate")) return;
    var mask = document.createElement("div");
    mask.className = "gate";
    mask.innerHTML =
      '<div class="inner">' +
      '<h2 class="serif">访问口令</h2>' +
      '<p style="margin:0;color:var(--muted);font-size:13px">这是私人看房记录，输入口令继续。</p>' +
      '<input type="password" id="gate-pw" placeholder="口令" autocomplete="current-password">' +
      '<div class="err" id="gate-err"></div>' +
      '<button class="btn block" id="gate-ok">进入</button>' +
      "</div>";
    document.body.appendChild(mask);
    var input = mask.querySelector("#gate-pw");
    var err = mask.querySelector("#gate-err");
    function tryIn() {
      var pw = input.value.trim();
      if (!pw) { err.textContent = "请输入口令"; return; }
      window.HouseApp.setPassword(pw);
      fetch("/api/houses", { headers: { "X-Site-Password": pw } }).then(function (r) {
        if (r.ok) { mask.remove(); onOk(); }
        else { err.textContent = "口令不对，再试试"; }
      });
    }
    mask.querySelector("#gate-ok").addEventListener("click", tryIn);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") tryIn(); });
    input.focus();
  }
})();
