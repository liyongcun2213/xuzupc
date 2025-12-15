-- 产品管理功能数据库更新脚本
USE rental_system;

-- 1. 更新产品类别表，删除现有数据并插入电脑主机和打印机类别
DELETE FROM product_categories;
INSERT INTO product_categories (name, description) VALUES 
('电脑主机', '自定义配置的电脑主机，由各种配件组合而成'),
('打印机', '各类品牌和型号的打印机');

-- 2. 创建产品配件关联表，用于存储电脑主机与配件的关系
CREATE TABLE IF NOT EXISTS product_accessories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    product_id INT NOT NULL,
    accessory_id INT NOT NULL,
    quantity INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id) ON DELETE CASCADE,
    UNIQUE KEY unique_product_accessory (product_id, accessory_id)
);

-- 3. 更新产品表，添加打印机特有字段
ALTER TABLE products
ADD COLUMN IF NOT EXISTS printer_type VARCHAR(100) COMMENT '打印机类型',
ADD COLUMN IF NOT EXISTS is_custom_config BOOLEAN DEFAULT FALSE COMMENT '是否为自定义配置',
ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2) DEFAULT 0.00 COMMENT '总价格（配件组合时使用）',
ADD COLUMN IF NOT EXISTS calculated_daily_rent DECIMAL(10,2) DEFAULT 0.00 COMMENT '计算得出的日租金',
ADD COLUMN IF NOT EXISTS calculated_monthly_rent DECIMAL(10,2) DEFAULT 0.00 COMMENT '计算得出的月租金';

-- 4. 确保配件类别表中包含电脑配件所需的类别
DELETE FROM accessory_categories;
INSERT INTO accessory_categories (name, description) VALUES 
('CPU', '中央处理器'),
('散热器', 'CPU散热器'),
('主板', '电脑主板'),
('内存', '内存条'),
('硬盘', '固态硬盘和机械硬盘'),
('显卡', '独立显卡'),
('机箱', '电脑机箱'),
('电源', '电脑电源'),
('显示器', '电脑显示器');

-- 5. 创建资产历史记录表，用于追踪资产变化
CREATE TABLE IF NOT EXISTS asset_history (
    id INT PRIMARY KEY AUTO_INCREMENT,
    record_date DATE NOT NULL,
    total_equipment_value DECIMAL(15,2) DEFAULT 0.00 COMMENT '设备总价值',
    total_accessory_value DECIMAL(15,2) DEFAULT 0.00 COMMENT '配件总价值',
    total_asset_value DECIMAL(15,2) DEFAULT 0.00 COMMENT '资产总价值',
    equipment_depreciation DECIMAL(15,2) DEFAULT 0.00 COMMENT '设备折旧',
    accessory_depreciation DECIMAL(15,2) DEFAULT 0.00 COMMENT '配件折旧',
    total_depreciation DECIMAL(15,2) DEFAULT 0.00 COMMENT '总折旧',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_date (record_date)
);

-- 6. 创建资产计算配置表，存储折旧率等配置
CREATE TABLE IF NOT EXISTS asset_settings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    setting_name VARCHAR(100) NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入默认资产配置
INSERT INTO asset_settings (setting_name, setting_value, description) VALUES
('equipment_depreciation_rate', '0.05', '设备年折旧率(5%)'),
('accessory_depreciation_rate', '0.10', '配件年折旧率(10%)'),
('monthly_rental_multiplier', '0.0667', '月租金计算倍数(总价/15，约为1/15)'),
('daily_rental_from_monthly', '0.0333', '日租金从月租金计算(月租金/30)');

-- 7. 创建资产快照表，用于记录每月资产详情
CREATE TABLE IF NOT EXISTS asset_snapshots (
    id INT PRIMARY KEY AUTO_INCREMENT,
    snapshot_date DATE NOT NULL,
    device_count INT DEFAULT 0 COMMENT '设备数量',
    device_total_value DECIMAL(15,2) DEFAULT 0.00 COMMENT '设备总价值',
    accessory_count INT DEFAULT 0 COMMENT '配件数量',
    accessory_total_value DECIMAL(15,2) DEFAULT 0.00 COMMENT '配件总价值',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_snapshot_date (snapshot_date)
);