-- 更新配件批次跟踪系统
-- 这个脚本将添加必要的表和修改现有表，以支持精确的配件批次跟踪

-- 1. 创建配件批次库存表，跟踪每个配件的具体批次ID
CREATE TABLE IF NOT EXISTS accessory_batch_stock (
    id INT PRIMARY KEY AUTO_INCREMENT,
    accessory_id INT NOT NULL COMMENT '配件ID',
    batch_id INT NOT NULL COMMENT '采购批次ID',
    batch_item_id INT NOT NULL COMMENT '采购批次中的具体项目ID',
    unique_id VARCHAR(20) UNIQUE NOT NULL COMMENT '唯一批次ID (格式: B001-00001)',
    purchase_price DECIMAL(10,2) NOT NULL COMMENT '采购价格',
    quantity INT NOT NULL DEFAULT 1 COMMENT '数量',
    used_quantity INT NOT NULL DEFAULT 0 COMMENT '已使用数量',
    available_quantity INT GENERATED ALWAYS AS (quantity - used_quantity) STORED COMMENT '可用数量',
    status ENUM('in_stock', 'in_use', 'exhausted') DEFAULT 'in_stock' COMMENT '状态',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (accessory_id) REFERENCES accessories(id),
    FOREIGN KEY (batch_id) REFERENCES purchase_batches(id),
    FOREIGN KEY (batch_item_id) REFERENCES purchase_accessory_items(id),
    INDEX idx_accessory_batch (accessory_id, batch_id),
    INDEX idx_unique_id (unique_id)
) COMMENT='配件批次库存表';

-- 2. 修改设备组装表，添加批次信息
ALTER TABLE device_assemblies 
ADD COLUMN IF NOT EXISTS batch_stock_id INT NULL COMMENT '批次库存ID' AFTER accessory_id,
ADD COLUMN IF NOT EXISTS unique_batch_id VARCHAR(20) NULL COMMENT '唯一批次ID' AFTER batch_stock_id,
ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(10,2) NULL COMMENT '采购价格' AFTER unique_batch_id,
ADD INDEX IF NOT EXISTS idx_batch_stock_id (batch_stock_id);

-- 3. 创建设备成本跟踪表
CREATE TABLE IF NOT EXISTS device_cost_tracking (
    id INT PRIMARY KEY AUTO_INCREMENT,
    device_id INT NOT NULL COMMENT '设备ID',
    accessory_id INT NOT NULL COMMENT '配件ID',
    batch_stock_id INT NOT NULL COMMENT '批次库存ID',
    unique_batch_id VARCHAR(20) NOT NULL COMMENT '唯一批次ID',
    quantity INT NOT NULL DEFAULT 1 COMMENT '使用数量',
    purchase_price DECIMAL(10,2) NOT NULL COMMENT '采购价格',
    total_cost DECIMAL(10,2) GENERATED ALWAYS AS (quantity * purchase_price) STORED COMMENT '总成本',
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '添加到设备的时间',
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (accessory_id) REFERENCES accessories(id),
    FOREIGN KEY (batch_stock_id) REFERENCES accessory_batch_stock(id),
    INDEX idx_device_cost (device_id),
    INDEX idx_accessory_cost (accessory_id)
) COMMENT='设备成本跟踪表';

-- 4. 创建视图，显示配件库存汇总信息
CREATE OR REPLACE VIEW v_accessory_stock_summary AS
SELECT 
    a.id AS accessory_id,
    a.name AS accessory_name,
    a.brand,
    a.model,
    ac.name AS category_name,
    ABS(SUM(available_quantity)) AS total_stock,
    COUNT(*) AS batch_count,
    AVG(purchase_price) AS avg_price,
    MIN(purchase_price) AS min_price,
    MAX(purchase_price) AS max_price
FROM accessories a
LEFT JOIN accessory_categories ac ON a.category_id = ac.id
LEFT JOIN accessory_batch_stock abs ON a.id = abs.accessory_id
WHERE abs.status != 'exhausted'
GROUP BY a.id, a.name, a.brand, a.model, ac.name
ORDER BY a.name;

-- 5. 创建存储过程，用于自动分配批次给设备组装
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS allocate_accessory_batches(
    IN p_device_id INT,
    IN p_accessory_id INT,
    IN p_quantity_needed INT
)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_batch_id INT;
    DECLARE v_batch_stock_id INT;
    DECLARE v_unique_id VARCHAR(20);
    DECLARE v_purchase_price DECIMAL(10,2);
    DECLARE v_available_qty INT;
    DECLARE v_qty_to_use INT;
    
    -- 创建游标，按FIFO顺序获取可用批次（按创建时间排序）
    DECLARE batch_cursor CURSOR FOR 
        SELECT id, unique_id, purchase_price, available_quantity
        FROM accessory_batch_stock 
        WHERE accessory_id = p_accessory_id 
        AND status = 'in_stock' 
        AND available_quantity > 0
        ORDER BY created_at ASC;
    
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- 打开游标
    OPEN batch_cursor;
    
    -- 初始化总分配数量
    SET @total_allocated = 0;
    
    -- 循环处理每个批次
    read_loop: LOOP
        FETCH batch_cursor INTO v_batch_stock_id, v_unique_id, v_purchase_price, v_available_qty;
        IF done OR @total_allocated >= p_quantity_needed THEN
            LEAVE read_loop;
        END IF;
        
        -- 计算当前批次需要使用的数量
        SET v_qty_to_use = LEAST(v_available_qty, p_quantity_needed - @total_allocated);
        
        -- 更新批次库存使用数量
        UPDATE accessory_batch_stock 
        SET used_quantity = used_quantity + v_qty_to_use,
            status = CASE 
                WHEN available_quantity - v_qty_to_use <= 0 THEN 'exhausted'
                WHEN used_quantity + v_qty_to_use > 0 THEN 'in_use'
                ELSE 'in_stock'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_batch_stock_id;
        
        -- 添加到设备组装表
        INSERT INTO device_assemblies (device_id, accessory_id, batch_stock_id, unique_batch_id, purchase_price, quantity)
        VALUES (p_device_id, p_accessory_id, v_batch_stock_id, v_unique_id, v_purchase_price, v_qty_to_use);
        
        -- 添加到设备成本跟踪表
        INSERT INTO device_cost_tracking (device_id, accessory_id, batch_stock_id, unique_batch_id, quantity, purchase_price)
        VALUES (p_device_id, p_accessory_id, v_batch_stock_id, v_unique_id, v_qty_to_use, v_purchase_price);
        
        -- 更新总分配数量
        SET @total_allocated = @total_allocated + v_qty_to_use;
    END LOOP;
    
    -- 关闭游标
    CLOSE batch_cursor;
    
    -- 返回分配结果
    SELECT @total_allocated AS allocated_quantity, p_quantity_needed AS needed_quantity;
END //
DELIMITER ;

-- 6. 创建触发器，在采购入库时自动生成批次库存记录
DELIMITER //
CREATE TRIGGER IF NOT EXISTS after_purchase_stock_in
AFTER INSERT ON purchase_stock_ins
FOR EACH ROW
BEGIN
    DECLARE v_batch_item_id INT;
    DECLARE v_unique_batch_id VARCHAR(20);
    DECLARE v_counter INT DEFAULT 1;
    
    -- 只处理配件入库
    IF NEW.item_type = 'accessory' THEN
        -- 获取采购批次项目ID
        SELECT id INTO v_batch_item_id 
        FROM purchase_accessory_items 
        WHERE batch_id = NEW.batch_id AND accessory_id = NEW.item_id
        LIMIT 1;
        
        -- 为每个入库的配件创建唯一的批次记录
        WHILE v_counter <= NEW.quantity DO
            -- 生成唯一批次ID (格式: B001-00001, B001-00002...)
            SET v_unique_batch_id = CONCAT(
                (SELECT LPAD(NEW.batch_id, 4, '0')),
                '-',
                (SELECT LPAD(v_counter, 5, '0'))
            );
            
            -- 插入批次库存记录
            INSERT INTO accessory_batch_stock (
                accessory_id, batch_id, batch_item_id, unique_id, 
                purchase_price, quantity, status
            ) VALUES (
                NEW.item_id, NEW.batch_id, v_batch_item_id, v_unique_batch_id,
                (SELECT unit_price FROM purchase_accessory_items WHERE id = v_batch_item_id),
                1, 'in_stock'
            );
            
            SET v_counter = v_counter + 1;
        END WHILE;
    END IF;
END //
DELIMITER ;

-- 7. 创建存储过程，生成唯一批次ID
DELIMITER //
CREATE PROCEDURE IF NOT EXISTS generate_unique_batch_id(
    IN p_batch_id INT,
    OUT p_unique_id VARCHAR(20)
)
BEGIN
    DECLARE v_counter INT DEFAULT 1;
    
    -- 获取当前批次中最大的序列号
    SELECT CAST(SUBSTRING(unique_id, 7) AS UNSIGNED) INTO v_counter
    FROM accessory_batch_stock 
    WHERE batch_id = p_batch_id
    ORDER BY CAST(SUBSTRING(unique_id, 7) AS UNSIGNED) DESC
    LIMIT 1;
    
    SET v_counter = IFNULL(v_counter, 0) + 1;
    
    -- 生成唯一批次ID (格式: B001-00001)
    SET p_unique_id = CONCAT(
        LPAD(p_batch_id, 4, '0'),
        '-',
        LPAD(v_counter, 5, '0')
    );
END //
DELIMITER ;