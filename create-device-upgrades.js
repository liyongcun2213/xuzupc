const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
  charset: 'utf8mb4',
});

const createTableSQL = `
CREATE TABLE IF NOT EXISTS device_upgrades (
  id int NOT NULL AUTO_INCREMENT,
  device_id int NOT NULL COMMENT '设备ID',
  old_product_code varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原产品型号',
  new_product_code varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '新产品型号',
  old_device_code varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原设备编号',
  new_device_code varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '新设备编号',
  upgrade_type enum('component_add','component_replace','component_remove') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '升级类型',
  old_accessory_id int DEFAULT NULL COMMENT '原配件ID',
  new_accessory_id int DEFAULT NULL COMMENT '新配件ID',
  accessory_name varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配件名称',
  description text COLLATE utf8mb4_unicode_ci COMMENT '升级描述',
  operator_id int DEFAULT NULL COMMENT '操作员ID',
  upgrade_date datetime DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_device_id (device_id),
  KEY idx_upgrade_date (upgrade_date),
  CONSTRAINT device_upgrades_ibfk_1 FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备升级记录表';
`;

db.connect(err => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }

  console.log('正在创建 device_upgrades 表...');
  db.query(createTableSQL, err => {
    if (err) {
      console.error('创建 device_upgrades 表失败:', err.message);
      process.exit(1);
    }
    console.log('✓ device_upgrades 表创建成功或已存在');
    db.end();
  });
});
