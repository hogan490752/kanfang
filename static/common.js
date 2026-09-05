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
    coordinateError: function (longitude, latitude) {
      var lon = String(longitude == null ? "" : longitude).trim();
      var lat = String(latitude == null ? "" : latitude).trim();
      if (!lon && !lat) return "";
      if (!lon || !lat) return "请同时填写经度和纬度，或同时留空";
      var decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
      if (!decimal.test(lon) || !Number.isFinite(Number(lon)) || Math.abs(Number(lon)) > 180)
        return "经度必须是 -180 到 180 之间的数字";
      if (!decimal.test(lat) || !Number.isFinite(Number(lat)) || Math.abs(Number(lat)) > 90)
        return "纬度必须是 -90 到 90 之间的数字";
      return "";
    },
    amapUrl: function (h) {
      if (h.longitude == null || h.latitude == null ||
          String(h.longitude).trim() === "" || String(h.latitude).trim() === "" ||
          this.coordinateError(h.longitude, h.latitude)) return "";
      return "https://uri.amap.com/marker?position=" + Number(h.longitude) + "," + Number(h.latitude) +
        "&name=" + encodeURIComponent(h.name || "小区位置") + "&coordinate=gaode&src=kanfang&callnative=0";
    },
    coordinateSaveError: function (submitted, saved) {
      function normalized(value) {
        return value == null || String(value).trim() === "" ? null : Number(value);
      }
      if (!saved || ["longitude", "latitude"].some(function (key) {
        return normalized(submitted[key]) !== normalized(saved[key]);
      })) return "经纬度未保存成功，请确认已关闭旧服务并重启项目后重试。填写的内容已保留。";
      return "";
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
