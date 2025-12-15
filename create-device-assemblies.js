const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
  charset: 'utf8mb4',
});

const createTableSQL = `
CREATE TABLE IF NOT EXISTS device_assemblies (
  id int NOT NULL AUTO_INCREMENT,
  device_id int NOT NULL COMMENT '设备ID',
  accessory_id int NOT NULL COMMENT '配件ID',
  accessory_name varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '配件名称',
  brand varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品牌',
  model varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '型号',
  quantity int DEFAULT '1' COMMENT '使用数量',
  created_at timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_device_id (device_id),
  KEY idx_accessory_id (accessory_id),
  CONSTRAINT device_assemblies_ibfk_1 FOREIGN KEY (device_id) REFERENCES devices (id) ON DELETE CASCADE,
  CONSTRAINT device_assemblies_ibfk_2 FOREIGN KEY (accessory_id) REFERENCES accessories (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备组装表';
`;

db.connect(err => {
  if (err) {
    console.error('数据库连接失败:', err.message);
    process.exit(1);
  }

  console.log('正在创建 device_assemblies 表...');
  db.query(createTableSQL, err => {
    if (err) {
      console.error('创建 device_assemblies 表失败:', err.message);
      process.exit(1);
    }
    console.log('✓ device_assemblies 表创建成功或已存在');
    db.end();
  });
});
