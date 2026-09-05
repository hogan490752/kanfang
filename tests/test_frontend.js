// node tests/test_frontend.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../static/common.js'), 'utf8'), context);
const app = context.window.HouseApp;
const submitted = { longitude: '114.27', latitude: '30.49' };
assert.equal(app.coordinateSaveError(submitted, { longitude: 114.27, latitude: 30.49 }), '');
// 旧后端返回200但忽略坐标时，必须报错并保留表单。
assert.ok(app.coordinateSaveError(submitted, { id: 1 }));
assert.ok(app.coordinateSaveError(submitted, { longitude: null, latitude: null }));
assert.ok(app.coordinateSaveError(submitted, { longitude: 114.28, latitude: 30.49 }));
// 清空坐标失败也不可假报成功，数值0不能当成未填写。
assert.ok(app.coordinateSaveError({ longitude: '', latitude: '' }, submitted));
assert.equal(app.coordinateSaveError({ longitude: '', latitude: '' }, { longitude: null, latitude: null }), '');
assert.equal(app.coordinateSaveError({ longitude: '0', latitude: '0' }, { longitude: 0, latitude: 0 }), '');
assert.ok(app.coordinateSaveError({ longitude: '0', latitude: '0' }, {}));
assert.equal(new URL(app.amapUrl(submitted)).searchParams.get('position'), '114.27,30.49');
console.log('Frontend coordinate save regression checks passed');
