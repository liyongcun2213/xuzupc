USE rental_system;

-- 添加配件类别表
CREATE TABLE IF NOT EXISTS accessory_categories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 添加配件表
CREATE TABLE IF NOT EXISTS accessories (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    category_id INT,
    brand VARCHAR(100),
    model VARCHAR(100),
    description TEXT,
    unit_price DECIMAL(10,2),
    stock_quantity INT DEFAULT 0,
    min_stock_level INT DEFAULT 5,
    supplier_id INT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES accessory_categories(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
);

-- 插入配件类别（如果不存在）
INSERT IGNORE INTO accessory_categories (name, description) VALUES 
('CPU', '中央处理器'),
('内存', '内存条'),
('硬盘', '固态硬盘和机械硬盘'),
('显卡', '独立显卡'),
('主板', '电脑主板'),
('电源', '电脑电源'),
('显示器', '电脑显示器'),
('键盘鼠标', '键盘和鼠标套装'),
('外设', '其他外设配件');