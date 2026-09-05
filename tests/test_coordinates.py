"""坐标 API 与旧库迁移回归测试，所有数据均写入临时目录。"""
import importlib.util
import json
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest
from unittest.mock import patch


class CoordinateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        source = Path(__file__).resolve().parents[1] / "app.py"
        target = Path(self.temp.name) / "app.py"
        shutil.copyfile(source, target)
        spec = importlib.util.spec_from_file_location("coordinate_test_app", target)
        self.module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.module)
        self.module.SITE_PASSWORD = ""
        self.client = self.module.app.test_client()

    def create(self, **kwargs):
        response = self.client.post("/api/houses", json={"name": "测试小区", **kwargs})
        self.assertEqual(response.status_code, 201, response.json)
        return response.json["house"]

    def test_coordinate_lifecycle(self):
        house = self.create(longitude="114.305393", latitude="30.593099")
        url = f"/api/houses/{house['id']}"
        self.assertEqual(house["longitude"], 114.305393)
        self.assertEqual(house["latitude"], 30.593099)
        listed = self.client.get("/api/houses").json["houses"][0]
        self.assertEqual(listed["longitude"], house["longitude"])
        # 旧客户端没有坐标字段，更新其他信息仍保留位置。
        response = self.client.put(url, json={"name": "修改名称"})
        self.assertEqual(response.json["house"]["latitude"], 30.593099)
        response = self.client.put(url, json={"name": "修改名称", "longitude": 0, "latitude": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["house"]["longitude"], 0)
        response = self.client.put(url, json={"name": "修改名称", "longitude": "", "latitude": " "})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json["house"]["longitude"])
        self.assertIsNone(response.json["house"]["latitude"])

    def test_invalid_coordinates_do_not_write(self):
        house = self.create(longitude=114, latitude=30)
        invalid = [(181, 30), (114, -91), ("abc", 30), ("NaN", 30),
                   (114, "Infinity"), ("", 30), (114, None), (True, 30),
                   ([], 30), ({}, 30), ("1e999", 30)]
        for lon, lat in invalid:
            for method, url in (("post", "/api/houses"), ("put", f"/api/houses/{house['id']}")):
                with self.subTest(lon=lon, lat=lat, method=method):
                    response = getattr(self.client, method)(url, json={
                        "name": "错误输入", "longitude": lon, "latitude": lat,
                    })
                    self.assertEqual(response.status_code, 400, response.json)
        listed = self.client.get("/api/houses").json["houses"]
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["longitude"], 114)
        self.assertEqual(listed[0]["name"], "测试小区")

    def test_optional_and_boundary_coordinates(self):
        house = self.create()
        self.assertIsNone(house["longitude"])
        for lon, lat in ((-180, -90), (180, 90)):
            response = self.client.put(f"/api/houses/{house['id']}", json={
                "name": house["name"], "longitude": lon, "latitude": lat,
            })
            self.assertEqual(response.status_code, 200)

    def test_old_database_migration_is_repeatable(self):
        house = self.create(notes="保留原有信息")
        with closing(sqlite3.connect(self.module.DB_PATH)) as db, db:
            db.execute("INSERT INTO rooms (house_id, title) VALUES (?, '原有房子')", (house["id"],))
            db.execute("INSERT INTO videos (house_id, room_id, filename, orig_name) VALUES (?, 1, 'test.mp4', '原有视频')", (house["id"],))
            db.execute("ALTER TABLE houses DROP COLUMN longitude")
            db.execute("ALTER TABLE houses DROP COLUMN latitude")
        self.module.init_db()
        self.module.init_db()
        listed = self.client.get("/api/houses").json["houses"][0]
        self.assertIsNone(listed["longitude"])
        self.assertIsNone(listed["latitude"])
        self.assertEqual(listed["notes"], "保留原有信息")
        self.assertEqual(listed["rooms"][0]["title"], "原有房子")
        self.assertEqual(listed["rooms"][0]["videos"][0]["orig_name"], "原有视频")

    def test_map_config_is_protected_and_not_cached(self):
        config_path = Path(self.temp.name) / "map_config.json"
        config_path.write_text(json.dumps({"key": "test-key", "securityJsCode": "test-code"}), encoding="utf-8")
        self.module.SITE_PASSWORD = "test-password"
        self.assertEqual(self.client.get("/api/map-config").status_code, 401)
        with patch.dict("os.environ", {}, clear=True):
            response = self.client.get("/api/map-config", headers={"X-Site-Password": "test-password"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json, {"key": "test-key", "securityJsCode": "test-code"})
        self.assertEqual(response.headers["Cache-Control"], "no-store")

    def test_map_config_environment_overrides_local_file(self):
        with patch.dict("os.environ", {"AMAP_KEY": "env-key", "AMAP_SECURITY_JS_CODE": "env-code"}):
            response = self.client.get("/api/map-config")
        self.assertEqual(response.json, {"key": "env-key", "securityJsCode": "env-code"})


if __name__ == "__main__":
    unittest.main()
