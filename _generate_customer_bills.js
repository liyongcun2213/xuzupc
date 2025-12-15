const mysql = require('mysql');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'xiaoli2213xX!',
  database: 'rental_system',
});

// 日期标准化函数：将日期设置为当天的00:00:00
function normalizeToStartOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) {
    d.setDate(0);
  }
  return d;
}

function formatDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getCycleMonths(paymentCycle) {
  if (paymentCycle === 'monthly') return 1;
  if (paymentCycle === 'quarterly') return 3;
  if (paymentCycle === 'yearly') return 12;
  return 3;
}

function generateBillsForCustomer(customerId, callback) {
  console.log(`\n==== 生成客户 ${customerId} 的账单 ====`);

  db.query(
    "SELECT id, order_number, payment_cycle, start_date, end_date, status FROM rental_orders WHERE customer_id = ? AND status IN ('active','returned','expired')",
    [customerId],
    (err, orders) => {
      if (err) {
        console.error('查询订单失败:', err);
        return callback(err);
      }

      if (!orders || orders.length === 0) {
        console.log('无租赁订单，跳过');
        return callback();
      }

      const today = new Date();

      const groups = {};
      orders.forEach((o) => {
        if (!o.payment_cycle) return;
        if (!groups[o.payment_cycle]) groups[o.payment_cycle] = [];
        groups[o.payment_cycle].push(o);
      });

      const cycles = Object.keys(groups);
      if (cycles.length === 0) {
        console.log('订单没有设置付款周期，跳过');
        return callback();
      }

      let groupIndex = 0;

      function processNextGroup() {
        if (groupIndex >= cycles.length) return callback();
        const cycle = cycles[groupIndex++];
        const ordersInGroup = groups[cycle];
        const cycleMonths = getCycleMonths(cycle);

        const minStart = new Date(
          Math.min.apply(
            null,
            ordersInGroup.map((o) => new Date(o.start_date).getTime()),
          ),
        );

        // 找到该周期订单组的最大结束日期
        const maxEnd = new Date(
          Math.max.apply(
            null,
            ordersInGroup.map((o) => new Date(o.end_date).getTime()),
          ),
        );

        console.log(`付款周期 ${cycle}, 起始日期 ${formatDate(minStart)}, 结束日期 ${formatDate(maxEnd)}, 订单数 ${ordersInGroup.length}`);

        db.query(
          'SELECT period_start, period_end FROM customer_bills WHERE customer_id = ? AND payment_cycle = ? ORDER BY period_end DESC LIMIT 1',
          [customerId, cycle],
          (err, lastBillRows) => {
            if (err) {
              console.error('查询历史账单失败:', err);
              return callback(err);
            }

            let periodStart = minStart;
            if (lastBillRows && lastBillRows.length > 0) {
              const lastEnd = new Date(lastBillRows[0].period_end);
              lastEnd.setDate(lastEnd.getDate() + 1);
              if (lastEnd > periodStart) periodStart = lastEnd;
            }

            const newBills = [];

            // 以订单最大结束日期为准，而不是今天
            while (periodStart <= maxEnd) {
              const naturalEnd = addMonths(periodStart, cycleMonths);
              naturalEnd.setDate(naturalEnd.getDate() - 1);
              const periodEnd = naturalEnd > maxEnd ? maxEnd : naturalEnd;

              newBills.push({
                payment_cycle: cycle,
                period_start: new Date(periodStart.getTime()),
                period_end: new Date(periodEnd.getTime()),
              });

              const nextStart = new Date(periodEnd.getTime());
              nextStart.setDate(nextStart.getDate() + 1);
              periodStart = nextStart;
            }

            if (newBills.length === 0) {
              console.log(`付款周期 ${cycle} 无需新增账单`);
              return processNextGroup();
            }

            console.log(`付款周期 ${cycle} 需要新增 ${newBills.length} 个账单周期`);

            generateAmountsForBills(customerId, ordersInGroup, newBills, today, (err2) => {
              if (err2) return callback(err2);
              processNextGroup();
            });
          },
        );
      }

      processNextGroup();
    },
  );
}

function generateAmountsForBills(customerId, ordersInGroup, billPeriods, billDate, done) {
  const cycle = ordersInGroup[0].payment_cycle;
  const orderIds = ordersInGroup.map((o) => o.id);

  const sql = `
    SELECT 
      ro.id AS order_id,
      ro.order_number,
      roi.id AS item_id,
      roi.daily_rate,
      roi.monthly_rate,
      roi.start_date,
      roi.end_date,
      roi.actual_return_date,
      d.device_code,
      p.name AS product_name
    FROM rental_orders ro
    LEFT JOIN rental_order_items roi ON ro.id = roi.order_id
    LEFT JOIN devices d ON roi.device_id = d.id
    LEFT JOIN products p ON d.product_id = p.id
    WHERE ro.id IN (${orderIds.map(() => '?').join(',')})
  `;

  db.query(sql, orderIds, (err, items) => {
    if (err) {
      console.error('查询订单明细失败:', err);
      return done(err);
    }

    console.log(`订单明细条数: ${items.length}`);

    // 查询租金调整历史
    const adjustmentsSql = `
      SELECT 
        order_item_id,
        old_monthly_rate,
        new_monthly_rate,
        adjust_effective_date
      FROM rental_rent_adjustments
      WHERE order_id IN (${orderIds.map(() => '?').join(',')})
      ORDER BY order_item_id, adjust_effective_date
    `;

    db.query(adjustmentsSql, orderIds, (err, adjustments) => {
      if (err) {
        console.error('查询租金调整历史失败:', err);
        // 如果表不存在，继续使用原有逻辑
        adjustments = [];
      }

      // 将调整历史按 order_item_id 分组
      const adjustmentsByItem = {};
      adjustments.forEach(adj => {
        if (!adjustmentsByItem[adj.order_item_id]) {
          adjustmentsByItem[adj.order_item_id] = [];
        }
        adjustmentsByItem[adj.order_item_id].push(adj);
      });

      let pending = billPeriods.length;
      if (pending === 0) return done();

      billPeriods.forEach((bp) => {
        let totalAmount = 0;
        let itemCount = 0;

        items.forEach((it) => {
          if (!it.start_date) return;
          const itemStart = new Date(it.start_date);
          const itemEnd = new Date(
            it.actual_return_date || it.end_date || billDate,
          );

          const overlapStart = itemStart > bp.period_start ? itemStart : bp.period_start;
          const overlapEnd = itemEnd < bp.period_end ? itemEnd : bp.period_end;

          if (overlapStart > overlapEnd) return;

          // 获取该明细的租金调整历史
          const itemAdjustments = adjustmentsByItem[it.item_id] || [];

          let itemAmount = 0;
          let currentStart = new Date(overlapStart);

          if (itemAdjustments.length === 0) {
            // 没有调整历史，直接用当前价格
            const days = Math.floor(
              (overlapEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000),
            ) + 1;
            const dailyRate = it.daily_rate
              ? parseFloat(it.daily_rate)
              : it.monthly_rate
              ? parseFloat(it.monthly_rate) / 30
              : 0;
            itemAmount = dailyRate * days;
          } else {
            // 有调整历史，需要分段计算
            itemAdjustments.forEach((adj) => {
              const adjustDate = normalizeToStartOfDay(new Date(adj.adjust_effective_date));
              
              // 计算调整前的天数和费用（不包含调整当天）
              if (currentStart < adjustDate && currentStart <= overlapEnd) {
                const segmentEnd = adjustDate < overlapEnd ? new Date(adjustDate.getTime() - 24 * 3600 * 1000) : overlapEnd;
                if (segmentEnd >= currentStart) {
                  const days = Math.floor((segmentEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
                  const dailyRate = parseFloat(adj.old_monthly_rate) / 30;
                  itemAmount += dailyRate * days;
                }
                currentStart = adjustDate;
              }
            });

            // 计算调整后剩余时间的费用（从调整当天开始）
            if (currentStart <= overlapEnd) {
              const days = Math.floor((overlapEnd.getTime() - currentStart.getTime()) / (24 * 3600 * 1000)) + 1;
              const lastAdjustment = itemAdjustments[itemAdjustments.length - 1];
              const dailyRate = parseFloat(lastAdjustment.new_monthly_rate) / 30;
              itemAmount += dailyRate * days;
            }
          }

          totalAmount += itemAmount;
          itemCount += 1;
        });

        if (totalAmount <= 0) {
          console.log(
            `周期 ${formatDate(bp.period_start)} ~ ${formatDate(bp.period_end)} 没有费用，略过不生成账单`,
          );
          if (--pending === 0) done();
          return;
        }

        // 生成账单编号（格式：BD[递增序号]+年月日-月日，如 BD1 20250105-0206）
        const startDateStr = formatDate(bp.period_start).replace(/-/g, ''); // 取完整YYYYMMDD
        const endDateStr = formatDate(bp.period_end).replace(/-/g, '').substring(4); // 取MMDD

        const seqSql = 'SELECT COALESCE(MAX(id), 0) + 1 AS nextId FROM customer_bills';

        db.query(seqSql, (seqErr, seqRows) => {
          let seq = 1;
          if (!seqErr && seqRows && seqRows.length > 0 && seqRows[0].nextId) {
            seq = seqRows[0].nextId;
          } else if (seqErr) {
            console.error('获取账单序号失败，将使用1作为起始序号:', seqErr);
          }

          const billNumber = `BD${seq}${startDateStr}-${endDateStr}`;

          const insertSql = `
            INSERT INTO customer_bills
            (bill_number, customer_id, payment_cycle, period_start, period_end, bill_date, amount, status, item_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'unpaid', ?)
          `;

          db.query(
            insertSql,
            [
              billNumber,
              customerId,
              cycle,
              formatDate(bp.period_start),
              formatDate(bp.period_end),
              formatDate(billDate),
              totalAmount.toFixed(2),
              itemCount,
            ],

          (err2) => {
            if (err2) {
              console.error('插入账单失败:', err2);
              if (--pending === 0) done(err2);
            } else {
              console.log(
                `生成账单 ${billNumber}, 周期 ${formatDate(bp.period_start)} ~ ${formatDate(
                  bp.period_end,
                )}, 金额 ${totalAmount.toFixed(2)}, 项目数 ${itemCount}`,
              );
              if (--pending === 0) done();
            }
          },
        );
      });
    });
  });
}

function main() {
  db.connect((err) => {
    if (err) {
      console.error('数据库连接失败:', err);
      process.exit(1);
    }

    db.query('SELECT id FROM customers WHERE status = "active"', (err2, customers) => {
      if (err2) {
        console.error('查询客户失败:', err2);
        db.end();
        return;
      }

      let index = 0;
      function next() {
        if (index >= customers.length) {
          console.log('\n全部客户账单生成完成');
          db.end();
          return;
        }
        const customerId = customers[index++].id;
        generateBillsForCustomer(customerId, (err3) => {
          if (err3) {
            console.error('生成客户账单失败:', err3);
          }
          next();
        });
      }

      next();
    });
  });
}

if (require.main === module) {
  main();
}

module.exports = { generateBillsForCustomer };
