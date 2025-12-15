-- 为 accessory_batch_stock 添加 scrapped_quantity 字段
-- 修改 available_quantity 的计算逻辑

-- 1. 删除原有的计算列
ALTER TABLE accessory_batch_stock 
DROP COLUMN available_quantity;

-- 2. 添加 scrapped_quantity 字段
ALTER TABLE accessory_batch_stock 
ADD COLUMN scrapped_quantity INT NOT NULL DEFAULT 0 COMMENT '报废数量' AFTER used_quantity;

-- 3. 重新创建 available_quantity 为计算列
ALTER TABLE accessory_batch_stock 
ADD COLUMN available_quantity INT GENERATED ALWAYS AS (quantity - used_quantity - scrapped_quantity) STORED COMMENT '可用数量';

-- 4. 更新状态枚举，添加说明注释
ALTER TABLE accessory_batch_stock 
MODIFY COLUMN status ENUM('in_stock', 'in_use', 'exhausted', 'scrapped') DEFAULT 'in_stock' 
COMMENT '状态: in_stock=库存中, in_use=使用中, exhausted=用尽, scrapped=已报废';
