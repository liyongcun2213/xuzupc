-- 修复 allocate_accessory_batches 存储过程，添加 accessory_name

DROP PROCEDURE IF EXISTS allocate_accessory_batches;

DELIMITER $$

CREATE PROCEDURE allocate_accessory_batches(
    IN p_device_id INT,
    IN p_accessory_id INT,
    IN p_quantity_needed INT
)
BEGIN
    -- 所有变量声明必须在最前面
    DECLARE done INT DEFAULT FALSE;
    DECLARE v_batch_stock_id INT;
    DECLARE v_unique_id VARCHAR(20);
    DECLARE v_purchase_price DECIMAL(10,2);
    DECLARE v_available_qty INT;
    DECLARE v_qty_to_use INT;
    DECLARE v_accessory_name VARCHAR(100);
    DECLARE v_brand VARCHAR(50);
    DECLARE v_model VARCHAR(100);
    
    -- 游标声明必须在变量之后
    DECLARE batch_cursor CURSOR FOR 
        SELECT id, unique_id, purchase_price, available_quantity
        FROM accessory_batch_stock 
        WHERE accessory_id = p_accessory_id 
        AND status IN ('in_stock', 'in_use')
        AND available_quantity > 0
        ORDER BY created_at ASC;
    
    -- HANDLER 声明必须在游标之后
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;
    
    -- 获取配件信息
    SELECT name, brand, model 
    INTO v_accessory_name, v_brand, v_model
    FROM accessories 
    WHERE id = p_accessory_id
    LIMIT 1;
    
    OPEN batch_cursor;
    
    SET @total_allocated = 0;
    
    read_loop: LOOP
        FETCH batch_cursor INTO v_batch_stock_id, v_unique_id, v_purchase_price, v_available_qty;
        IF done OR @total_allocated >= p_quantity_needed THEN
            LEAVE read_loop;
        END IF;
        
        SET v_qty_to_use = LEAST(v_available_qty, p_quantity_needed - @total_allocated);
        
        -- 更新批次库存
        UPDATE accessory_batch_stock 
        SET used_quantity = used_quantity + v_qty_to_use,
            status = CASE 
                WHEN available_quantity - v_qty_to_use <= 0 THEN 'exhausted'
                WHEN used_quantity + v_qty_to_use > 0 THEN 'in_use'
                ELSE 'in_stock'
            END,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_batch_stock_id;

        -- 插入设备组装记录（包含 accessory_name, brand, model）
        INSERT INTO device_assemblies (
            device_id, accessory_id, batch_stock_id, unique_batch_id, 
            purchase_price, quantity, accessory_name, brand, model
        ) VALUES (
            p_device_id, p_accessory_id, v_batch_stock_id, v_unique_id, 
            v_purchase_price, v_qty_to_use, v_accessory_name, v_brand, v_model
        );

        -- 插入成本跟踪记录
        INSERT INTO device_cost_tracking (
            device_id, accessory_id, batch_stock_id, unique_batch_id, 
            quantity, purchase_price
        ) VALUES (
            p_device_id, p_accessory_id, v_batch_stock_id, v_unique_id, 
            v_qty_to_use, v_purchase_price
        );

        SET @total_allocated = @total_allocated + v_qty_to_use;
    END LOOP;

    CLOSE batch_cursor;

    -- 更新 accessories 表的 stock_quantity
    IF @total_allocated > 0 THEN
        UPDATE accessories 
        SET stock_quantity = stock_quantity - @total_allocated,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = p_accessory_id;
    END IF;

    -- 返回分配结果
    SELECT @total_allocated AS allocated_quantity, p_quantity_needed AS needed_quantity;
END$$

DELIMITER ;
