// 记录看房 · 上传页逻辑（小区 → 房子 → 视频 三级）
(function () {
  "use strict";

  var houses = [];
  var sel = document.getElementById("house-sel");
  var roomSel = document.getElementById("room-sel");
  var roomToggle = document.getElementById("room-toggle");
  var drop = document.getElementById("drop");
  var fileInput = document.getElementById("file");
  var picked = document.getElementById("picked");
  var bar = document.getElementById("bar");
  var barInner = bar.querySelector("i");
  var st = document.getElementById("st");
  var go = document.getElementById("go");
  var newToggle = document.getElementById("new-toggle");
  var file = null; // 当前选中的 File

  function curHouse() {
    return houses.find(function (h) { return String(h.id) === String(sel.value); });
  }

  function fillSelect() {
    var curH = sel.value, curR = roomSel.value;
    sel.innerHTML = "";
    houses.forEach(function (h) {
      var opt = document.createElement("option");
      opt.value = h.id;
      opt.textContent = (h.region ? "【" + h.region + "】" : "") + h.name;
      sel.appendChild(opt);
    });
    if (curH) sel.value = curH;
    fillRooms();
    if (curR) roomSel.value = curR;
  }

  function fillRooms() {
    var h = curHouse();
    var rooms = h ? (h.rooms || []) : [];
    var saved = roomSel.value;
    roomSel.innerHTML = "";
    rooms.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.title + (r.price ? "（" + r.price + "）" : "");
      roomSel.appendChild(opt);
    });
    if (rooms.length) {
      roomSel.value = saved && rooms.some(function (r) { return String(r.id) === String(saved); }) ? saved : String(rooms[0].id);
      roomToggle.open = false;
    } else {
      // 这个小区还没有房子：展开添加框提醒
      roomToggle.open = true;
    }
  }

  sel.addEventListener("change", fillRooms);

  function setFile(f) {
    file = f || null;
    if (!file) { picked.textContent = ""; return; }
    var okExt = /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    if (!okExt) {
      picked.textContent = "不支持的格式：" + file.name;
      picked.style.color = "var(--danger)";
      file = null;
      return;
    }
    picked.style.color = "";
    picked.textContent = "已选：" + file.name + "（" + HouseApp.fmtSize(file.size) + "）";
  }

  drop.addEventListener("click", function () { fileInput.click(); });
  drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener("change", function () { setFile(fileInput.files[0]); });

  // 手机相册/文件管理器拖拽基本不可用，桌面端支持一下
  ["dragover", "dragenter"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("on"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("on"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });

  function rv(id) { return document.getElementById(id); }

  // 添加房子（挂当前小区下）
  document.getElementById("nr-save").addEventListener("click", function () {
    var h = curHouse();
    if (!h) { st.textContent = "先选小区"; st.className = "status err"; return; }
    var body = {
      title: rv("nr-title").value.trim(),
      size: rv("nr-size").value.trim(),
      price: rv("nr-price").value.trim(),
      notes: rv("nr-notes").value.trim()
    };
    if (!body.title) { st.textContent = "房子叫法必填（如：2栋 3室2厅）"; st.className = "status err"; return; }
    fetch("/api/houses/" + h.id + "/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Password": HouseApp.getPassword() },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { st.textContent = res.d.error || "添加失败"; st.className = "status err"; return; }
        h.rooms = h.rooms || [];
        h.rooms.push(Object.assign({ videos: [] }, res.d.room));
        fillRooms();
        roomSel.value = String(res.d.room.id);
        roomToggle.open = false;
        ["nr-title", "nr-size", "nr-price", "nr-notes"].forEach(function (id) { rv(id).value = ""; });
        st.textContent = "房子「" + body.title + "」已添加，下面选视频即可";
        st.className = "status okc";
      })
      .catch(function () { st.textContent = "网络错误，添加失败"; st.className = "status err"; });
  });

  // 新建小区（全字段）
  document.getElementById("nh-save").addEventListener("click", function () {
    var val = function (id) { return rv(id).value.trim(); };
    var name = val("nh-name");
    if (!name) { st.textContent = "先填小区名称"; st.className = "status err"; return; }
    var body = {
      name: name,
      region: val("nh-region") || "其他",
      property_company: val("nh-prop"),
      property_fee: val("nh-fee"),
      pros: val("nh-pros"),
      cons: val("nh-cons"),
      metro: val("nh-metro-txt"),
      location: val("nh-location"),
      kindergarten: val("nh-kindergarten"),
      primary_school: val("nh-primary"),
      middle_school: val("nh-middle"),
      notes: val("nh-notes"),
      metro_ok: rv("nh-metro").checked,
      car_free: rv("nh-car").checked,
      middle_fixed: rv("nh-school").checked
    };
    fetch("/api/houses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Password": HouseApp.getPassword() },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) { st.textContent = res.d.error || "保存失败"; st.className = "status err"; return; }
        houses.push(Object.assign({ rooms: [], videos: [] }, res.d.house));
        fillSelect();
        sel.value = String(res.d.house.id);
        newToggle.open = false;
        ["nh-name", "nh-region", "nh-prop", "nh-fee", "nh-pros", "nh-cons", "nh-metro-txt",
         "nh-location", "nh-kindergarten", "nh-primary", "nh-middle", "nh-notes"].forEach(function (id) {
          rv(id).value = "";
        });
        ["nh-metro", "nh-car", "nh-school"].forEach(function (id) { rv(id).checked = false; });
        st.textContent = "小区「" + name + "」已创建，先添加一套房再传视频";
        st.className = "status okc";
        roomToggle.open = true;
      })
      .catch(function () { st.textContent = "网络错误，保存失败"; st.className = "status err"; });
  });

  // 提交上传（视频进所选房子）
  document.getElementById("form").addEventListener("submit", function (e) {
    e.preventDefault();
    st.className = "status";
    if (!file) { st.textContent = "先选一个视频"; st.className = "status err"; return; }
    var rid = roomSel.value;
    if (!rid) { st.textContent = "这个小区还没添加房子，先在上方添加一套"; st.className = "status err"; return; }

    var fd = new FormData();
    fd.append("file", file);
    fd.append("label", document.getElementById("label").value.trim());

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/rooms/" + rid + "/videos");
    xhr.setRequestHeader("X-Site-Password", HouseApp.getPassword());
    go.disabled = true;
    go.textContent = "上传中…";
    bar.classList.add("on");
    barInner.style.width = "0%";

    xhr.upload.addEventListener("progress", function (ev) {
      if (ev.lengthComputable) {
        var pct = Math.round((ev.loaded / ev.total) * 100);
        barInner.style.width = pct + "%";
        go.textContent = "上传中 " + pct + "%";
      }
    });
    xhr.addEventListener("load", function () {
      go.disabled = false;
      go.textContent = "上传";
      var d = {};
      try { d = JSON.parse(xhr.responseText); } catch (err) {}
      if (xhr.status >= 200 && xhr.status < 300) {
        barInner.style.width = "100%";
        st.textContent = "✅ 传好了！回对比表点小区名就能看到。";
        st.className = "status okc";
        setFile(null);
        fileInput.value = "";
        document.getElementById("label").value = "";
      } else {
        bar.classList.remove("on");
        st.textContent = d.error || ("上传失败（" + xhr.status + "）");
        st.className = "status err";
      }
    });
    xhr.addEventListener("error", function () {
      go.disabled = false;
      go.textContent = "上传";
      bar.classList.remove("on");
      st.textContent = "网络错误，上传失败";
      st.className = "status err";
    });
    xhr.send(fd);
  });

  HouseApp.loadHouses(function (data) {
    houses = data;
    fillSelect();
  });
})();
