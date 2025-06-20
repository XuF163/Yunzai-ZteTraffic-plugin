

// 导出类，类名与文件名一致，继承插件类
export class TrafficQuery extends plugin {
  constructor() {
    super({
      // 插件信息
      name: 'TrafficQuery',
      dsc: '流量查询插件',
      event: 'message',
      priority: 250,
      rule: [
        {
          reg: '^#zlx查询$',
          fnc: 'queryCurrentMonth'
        },
        {
          reg: '^#zlx查询\s*(\d{6})$',
          fnc: 'querySpecificMonth'
        },
        {
          reg: '^#zlx历史$',
          fnc: 'queryMultipleMonths'
        },
        {
          reg: '^#zlx帮助$',
          fnc: 'showHelp'
        }
      ]
    })
    
    // API配置
    this.baseUrl = 'https://mnp.zhusiot.com/Mini/BalUpdated.ashx'
    this.cardId = '9xxxxx' // 从抓包数据中提取的卡号
    this.headers = {
      'Host': 'mnp.zhusiot.com',
      'Connection': 'keep-alive',
      'xweb_xhr': '1',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 MicroMessenger/7.0.20.1781(0x6700143B) NetType/WIFI MiniProgramEnv/Windows WindowsWechat/WMPF WindowsWechat(0x63090c33)XWEB/13639',
      'Content-Type': 'application/json',
      'Accept': '*/*',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    }
  }

  // 查询当前月份流量
  async queryCurrentMonth(e) {
    await this.queryTraffic(e, 0)
    return true
  }

  // 查询指定月份流量
  async querySpecificMonth(e) {
    const match = e.msg.match(/^#zlx查询\s*(\d{6})$/)
    if (match) {
      const monthId = parseInt(match[1])
      await this.queryTraffic(e, monthId)
    } else {
      await e.reply('❌ 月份格式错误，请使用6位数字格式，如：202501')
    }
    return true
  }

  // 查询多个月份流量
  async queryMultipleMonths(e) {
    const monthList = [0, 202506, 202505, 202504, 202503, 202502, 202501]
    let resultMsg = '📊 流量历史查询结果\n\n'
    
    for (const monthId of monthList) {
      try {
        const data = await this.fetchTrafficData(monthId)
        if (data) {
          const summary = this.formatTrafficSummary(data, monthId)
          resultMsg += summary + '\n'
        }
        // 避免请求过于频繁
        await this.sleep(500)
      } catch (error) {
        console.error(`查询月份 ${monthId} 失败:`, error)
      }
    }
    
    await e.reply(resultMsg)
    return true
  }

  // 显示帮助信息
  async showHelp(e) {
    const helpMsg = `📱 流量查询插件帮助\n\n` +
      `🔍 可用命令：\n` +
      `#zlx查询 - 查询当前月份流量\n` +
      `#zlx查询 202501 - 查询指定月份流量\n` +
      `#zlx历史 - 查询最近几个月流量\n` +
      `#zlx帮助 - 显示此帮助信息\n\n` +
      `📝 说明：\n` +
      `• 月份格式：YYYYMM（如202501表示2025年1月）\n` +
      `• 数据来源：基于ProxyPin抓包数据\n` +
      `• 卡号：8986****2552`
    
    await e.reply(helpMsg)
    return true
  }

  // 核心查询方法
  async queryTraffic(e, monthId) {
    try {
      await e.reply('🔍 正在查询流量信息，请稍候...')
      
      const data = await this.fetchTrafficData(monthId)
      if (!data) {
        await e.reply('❌ 查询失败，请稍后重试')
        return
      }
      
      const formattedMsg = this.formatTrafficInfo(data, monthId)
      await e.reply(formattedMsg)
      
    } catch (error) {
      console.error('查询流量失败:', error)
      await e.reply('❌ 查询过程中发生错误，请稍后重试')
    }
  }

  // 获取流量数据
  async fetchTrafficData(monthId) {
    const params = new URLSearchParams({
      action: 'listRest',
      cardId: this.cardId,
      monthId: monthId.toString()
    })
    
    const url = `${this.baseUrl}?${params}`
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        timeout: 30000
      })
      
      if (response.ok) {
        const data = await response.json()
        return data
      } else {
        console.error(`请求失败，状态码: ${response.status}`)
        return null
      }
    } catch (error) {
      console.error('请求异常:', error)
      return null
    }
  }

  // 格式化完整流量信息
  formatTrafficInfo(data, monthId) {
    if (!data || data.getNum !== '0') {
      return '❌ 获取数据失败'
    }
    
    const objCard = data.objCard || {}
    const dtRest = data.dtRest || []
    
    let msg = `📱 流量查询结果\n`
    msg += `查询月份: ${monthId === 0 ? '当前月份' : monthId}\n\n`
    
    // 卡片信息
    msg += `💳 卡片信息:\n`
    msg += `卡号: ${objCard.cardCode || 'N/A'}\n`
    msg += `套餐: ${objCard.pro_name || 'N/A'}\n`
    msg += `当前套餐: ${objCard.currentMealName || 'N/A'}\n`
    msg += `剩余天数: ${objCard.DiffDate || 'N/A'}天\n\n`
    
    // 流量使用情况
    msg += `📊 流量使用:\n`
    const usageMonth = objCard.usageUsedByMonth || 0
    const usageAll = objCard.usageUsedByAll || 0
    msg += `本月使用: ${this.formatTrafficSize(usageMonth)}\n`
    msg += `总计使用: ${this.formatTrafficSize(usageAll)}\n\n`
    
    // 余额信息
    msg += `💰 余额信息:\n`
    msg += `充值金额: ${(objCard.moneyUp || 0).toFixed(2)}元 (共${objCard.numUp || 0}次)\n`
    msg += `消费金额: ${(objCard.moneyDn || 0).toFixed(2)}元 (共${objCard.numDn || 0}次)\n`
    msg += `本月消费: ${(objCard.moneyDnCurrentMonth || 0).toFixed(2)}元\n`
    
    // 交易记录（只显示最近3条）
    if (dtRest && dtRest.length > 0) {
      msg += `\n💳 最近交易记录:\n`
      const recentRecords = dtRest.slice(0, 3)
      for (const record of recentRecords) {
        const payDate = this.formatDate(record.pay_date)
        msg += `${payDate} | ${record.pay_name || 'N/A'} | ${(record.tradeMoney || 0).toFixed(2)}元\n`
      }
      if (dtRest.length > 3) {
        msg += `... 还有${dtRest.length - 3}条记录\n`
      }
    }
    
    return msg
  }

  // 格式化流量摘要（用于历史查询）
  formatTrafficSummary(data, monthId) {
    if (!data || data.getNum !== '0') {
      return `${monthId === 0 ? '当前月份' : monthId}: 查询失败`
    }
    
    const objCard = data.objCard || {}
    const usageMonth = objCard.usageUsedByMonth || 0
    const monthName = monthId === 0 ? '当前月份' : monthId
    
    return `📅 ${monthName}: ${this.formatTrafficSize(usageMonth)}`
  }

  // 格式化流量大小（API返回的是MB）
  formatTrafficSize(mb) {
    if (mb === 0) {
      return '0 MB'
    } else if (mb < 1024) {
      return `${mb.toFixed(2)} MB`
    } else {
      return `${(mb / 1024).toFixed(2)} GB`
    }
  }

  // 格式化日期
  formatDate(dateStr) {
    if (!dateStr) return 'N/A'
    
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (error) {
      return dateStr
    }
  }

  // 延时函数
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
