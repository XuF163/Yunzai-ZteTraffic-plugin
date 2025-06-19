
/**
 * 中兴视通设备流量查询插件
 * 支持查询设备状态、流量使用情况、刷新流量数据、切网操作等功能
 */
export class ZteTrafficPlugin extends plugin {
    constructor() {
      super({
        name: '中兴视通流量查询',
        dsc: '查询中兴视通设备流量使用情况和切网操作',
        event: 'message',
        priority: 5000,
        rule: [
          {
            reg: '^#?(中兴|zte)?(流量|traffic)(查询|状态|info)$',
            fnc: 'queryTraffic'
          },
          {
            reg: '^#?(中兴|zte)?(流量|traffic)(刷新|refresh|更新)$',
            fnc: 'refreshTraffic'
          },
          {
            reg: '^#?(中兴|zte)(切网|switch)$',
            fnc: 'switchNetwork'
          },
          {
            reg: '^#?(中兴|zte)设置\s*(\S+)\s*(\S+)$',
            fnc: 'setConfig'
          },
          {
            reg: '^#?(中兴|zte)(配置|config)$',
            fnc: 'showConfig'
          }
        ]
      })
  
      // 默认配置
      this.config = {
        PHPSESSID: '',
        SHORTCODE: '',
        baseURL: 'http://uapp.seecom.com.cn/ufi/',
        maxRetries: 3,
        retryDelay: 2000
      }
  
      // 从配置文件加载设置
      this.loadConfig()
    }
  
    /**
     * 加载配置
     */
    loadConfig() {
      try {
        // 这里可以从文件或数据库加载配置
        // 暂时使用硬编码配置，实际使用时需要用户设置
        this.config.PHPSESSID = ''
        this.config.SHORTCODE = ''
      } catch (error) {
        logger.error('[中兴流量] 配置加载失败:', error)
      }
    }
  
    /**
     * 获取请求头
     */
    getHeaders() {
      if (!this.config.PHPSESSID || !this.config.SHORTCODE) {
        return null
      }
  
      return {
        'Cookie': `PHPSESSID=${this.config.PHPSESSID}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 NetType/WIFI MicroMessenger/7.0.20.1781(0x6700143B) WindowsWechat(0x63090c33) XWEB/13639 Flue',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': 'http://uapp.seecom.com.cn',
        'Referer': `http://uapp.seecom.com.cn/ufi/equipmentMgmt.php?shortcode=${this.config.SHORTCODE}&fromgoto=1&from_url=intl`
      }
    }
  
    /**
     * 带重试机制的API请求
     */
    async makeRequest(action, body = {}, retries = 0) {
      const headers = this.getHeaders()
      if (!headers) {
        throw new Error('请求头创建失败，请检查配置')
      }
  
      const params = new URLSearchParams({
        action: action,
        p: Math.random().toString()
      })
      
      const requestBody = new URLSearchParams({
        shortcode: this.config.SHORTCODE,
        ...body
      })
  
      try {
        const response = await fetch(`${this.config.baseURL}ajax.php?${params}`, {
          method: 'POST',
          headers: headers,
          body: requestBody.toString()
        })
  
        // 检查 403 错误并重试
        if (response.status === 403 && retries < this.config.maxRetries) {
          logger.warn(`[中兴流量] 遇到403错误，${this.config.retryDelay}ms后进行第${retries + 1}次重试...`)
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
          return this.makeRequest(action, body, retries + 1)
        }
  
        if (!response.ok) {
          throw new Error(`HTTP错误: ${response.status} ${response.statusText}`)
        }
  
        const data = await response.json()
        
        if (typeof data !== 'object' || data === null) {
          throw new Error('响应不是有效的JSON，可能是PHPSESSID已过期')
        }
  
        return data
      } catch (error) {
        if (retries < this.config.maxRetries && (error.message.includes('403') || error.message.includes('fetch'))) {
          logger.warn(`[中兴流量] 请求失败，${this.config.retryDelay}ms后进行第${retries + 1}次重试: ${error.message}`)
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay))
          return this.makeRequest(action, body, retries + 1)
        }
        throw error
      }
    }
  
    /**
     * 获取设备信息
     */
    async getDeviceInfo() {
      try {
        const data = await this.makeRequest('suits', {
          flag: 'equipmentMgmt.php'
        })
        return data
      } catch (error) {
        throw new Error(`获取设备信息失败: ${error.message}`)
      }
    }
  
    /**
     * 刷新流量数据
     */
    async refreshFlow() {
      try {
        const data = await this.makeRequest('flushFlow')
        return data
      } catch (error) {
        throw new Error(`刷新流量失败: ${error.message}`)
      }
    }
  
    /**
     * 切网预检
     */
    async networkSwitchPreCheck(cardType, iccid) {
      try {
        const data = await this.makeRequest('tst', {
          cardtype: cardType,
          iccid: iccid
        })
        return data
      } catch (error) {
        throw new Error(`切网预检失败: ${error.message}`)
      }
    }
  
    /**
     * 获取切网参数
     */
    async getSwitchParams(cardType, iccid) {
      try {
        const data = await this.makeRequest('switch', {
          iccid: iccid,
          card_type: cardType
        })
        return data
      } catch (error) {
        throw new Error(`获取切网参数失败: ${error.message}`)
      }
    }
  
    /**
     * 执行切网
     */
    async executeSwitchNetwork(imei, policy) {
      try {
        const data = await this.makeRequest('switch_exec', {
          imei: imei,
          policy: policy
        })
        return data
      } catch (error) {
        throw new Error(`执行切网失败: ${error.message}`)
      }
    }
  
    /**
     * 完整的切网流程
     */
    async performNetworkSwitch(targetCard) {
      if (!targetCard || !targetCard.iccid || !targetCard.cardType) {
        throw new Error('目标卡信息不完整')
      }
  
      const { cardType, iccid } = targetCard
      
      // 步骤 1: 预检
      const preCheckResult = await this.networkSwitchPreCheck(cardType, iccid)
      if (preCheckResult.code === 103) {
        throw new Error(`预检失败: ${preCheckResult.msg}`)
      }
  
      // 步骤 2: 获取参数
      const switchParams = await this.getSwitchParams(cardType, iccid)
      if (switchParams.code !== 0) {
        throw new Error(`获取参数失败: ${switchParams.msg}`)
      }
  
      const { imei, policy } = switchParams
      if (!imei || !policy) {
        throw new Error('未能从响应中获取 imei 或 policy')
      }
  
      // 步骤 3: 执行切换
      const execResult = await this.executeSwitchNetwork(imei, policy)
      if (execResult.code !== 0) {
        throw new Error(`指令执行失败: ${execResult.msg}`)
      }
  
      return true
    }
  
    /**
     * 格式化设备信息为消息
     */
    formatDeviceInfo(info) {
      const {
        already,
        remain,
        total,
        unit,
        packageName,
        statusStr,
        term,
        deviceOnline,
        model,
        last_syn_time,
        cardsInfo,
        simSwitchPolicy
      } = info
  
      const policyMap = { '1': '电信 (DX)', '2': '移动 (YD)', '3': '联通 (LT)' }
      const currentPolicyStr = policyMap[simSwitchPolicy] || `未知 (${simSwitchPolicy})`
  
      let message = `📊 中兴设备状态报告\n`
      message += `━━━━━━━━━━━━━━━━━━━━\n`
      message += `📱 型号: ${model}\n`
      message += `🔗 状态: ${deviceOnline ? '在线' : '离线'}\n`
      message += `🌐 驻网: ${currentPolicyStr}\n`
      message += `📦 套餐: ${packageName || '无'}\n`
      message += `✅ 状态: ${statusStr}\n`
      message += `📅 有效期: ${term}\n`
      message += `━━━━━━━━━━━━━━━━━━━━\n`
      message += `📊 流量总览:\n`
      message += `  📈 已用: ${already} ${unit}\n`
      message += `  📉 剩余: ${remain} ${unit}\n`
      message += `  📋 总量: ${total} ${unit}\n`
      message += `🕐 同步时间: ${last_syn_time}\n`
      message += `━━━━━━━━━━━━━━━━━━━━\n`
      message += `📱 SIM卡信息:\n`
      
      if (cardsInfo && cardsInfo.length > 0) {
        cardsInfo.forEach(card => {
          const status = card.activated ? '✅已激活' : '❌未激活'
          const online = card.online ? '🌐在线' : '📴离线'
          message += `  [${card.cardType.toUpperCase()}] ${status} ${online}\n`
          message += `    ICCID: ${card.iccid}\n`
        })
      } else {
        message += `  未获取到SIM卡信息\n`
      }
  
      return message
    }
  
    /**
     * 查询流量命令
     */
    async queryTraffic(e) {
      if (!this.config.PHPSESSID || !this.config.SHORTCODE) {
        await e.reply('❌ 请先设置PHPSESSID和SHORTCODE\n使用命令: #中兴设置 <PHPSESSID> <SHORTCODE>')
        return
      }
  
      try {
        await e.reply('📡 正在查询设备信息...')
        const info = await this.getDeviceInfo()
        const message = this.formatDeviceInfo(info)
        await e.reply(message)
      } catch (error) {
        logger.error('[中兴流量] 查询失败:', error)
        await e.reply(`❌ 查询失败: ${error.message}`)
      }
    }
  
    /**
     * 刷新流量命令
     */
    async refreshTraffic(e) {
      if (!this.config.PHPSESSID || !this.config.SHORTCODE) {
        await e.reply('❌ 请先设置PHPSESSID和SHORTCODE\n使用命令: #中兴设置 <PHPSESSID> <SHORTCODE>')
        return
      }
  
      try {
        await e.reply('🔄 正在刷新流量数据...')
        
        // 刷新流量
        const refreshResult = await this.refreshFlow()
        
        if (refreshResult.code === '-3') {
          await e.reply(`⚠️ ${refreshResult.msg}`)
          return
        }
        
        await e.reply(`✅ ${refreshResult.msg}\n⏳ 等待10秒后获取最新数据...`)
        
        // 等待10秒后获取最新信息
        setTimeout(async () => {
          try {
            const info = await this.getDeviceInfo()
            const message = '🔄 刷新后的设备信息:\n' + this.formatDeviceInfo(info)
            await e.reply(message)
          } catch (error) {
            await e.reply(`❌ 获取刷新后信息失败: ${error.message}`)
          }
        }, 10000)
        
      } catch (error) {
        logger.error('[中兴流量] 刷新失败:', error)
        await e.reply(`❌ 刷新失败: ${error.message}`)
      }
    }
  
    /**
     * 切网命令
     */
    async switchNetwork(e) {
      if (!this.config.PHPSESSID || !this.config.SHORTCODE) {
        await e.reply('❌ 请先设置PHPSESSID和SHORTCODE\n使用命令: #中兴设置 <PHPSESSID> <SHORTCODE>')
        return
      }
  
      try {
        await e.reply('📡 正在获取设备信息...')
        
        // 获取当前设备信息
        const info = await this.getDeviceInfo()
        
        // 查找可切换的目标卡 (已激活但当前不在线的卡)
        const targetCard = info.cardsInfo?.find(card => card.activated && !card.online)
        
        if (!info.cardsInfo || info.cardsInfo.length <= 1) {
          await e.reply('❌ 设备为单卡或未检测到多张SIM卡')
          return
        }
        
        if (!targetCard) {
          await e.reply('❌ 未找到可切换的SIM卡（需要已激活但当前离线的卡）')
          return
        }
        
        await e.reply(`🚀 开始切网流程: 目标 [${targetCard.cardType.toUpperCase()}]\n⏳ 正在执行切网操作...`)
        
        // 执行切网
        await this.performNetworkSwitch(targetCard)
        
        await e.reply(`✅ 切网指令已成功发送！\n⏳ 等待15秒让设备重新连接网络...`)
        
        // 等待15秒后获取最新信息
        setTimeout(async () => {
          try {
            const updatedInfo = await this.getDeviceInfo()
            const message = '🔄 切网后的设备信息:\n' + this.formatDeviceInfo(updatedInfo)
            await e.reply(message)
          } catch (error) {
            await e.reply(`❌ 获取切网后信息失败: ${error.message}`)
          }
        }, 15000)
        
      } catch (error) {
        logger.error('[中兴流量] 切网失败:', error)
        await e.reply(`❌ 切网失败: ${error.message}`)
      }
    }
  
    /**
     * 设置配置命令
     */
    async setConfig(e) {
      if (!e.isMaster) {
        await e.reply('❌ 只有主人才能设置配置')
        return
      }
  
      const match = e.msg.match(/^#?(中兴|zte)设置\s*(\S+)\s*(\S+)$/)
      if (!match) {
        await e.reply('❌ 格式错误\n正确格式: #中兴设置 <PHPSESSID> <SHORTCODE>')
        return
      }
  
      const [, , phpsessid, shortcode] = match
      this.config.PHPSESSID = phpsessid
      this.config.SHORTCODE = shortcode
  
      // 这里应该保存配置到文件或数据库
      // 暂时只在内存中保存
  
      await e.reply(`✅ 配置已更新\nPHPSESSID: ${phpsessid.substring(0, 8)}...\nSHORTCODE: ${shortcode}`)
    }
  
    /**
     * 显示配置命令
     */
    async showConfig(e) {
      if (!e.isMaster) {
        await e.reply('❌ 只有主人才能查看配置')
        return
      }
  
      const phpsessid = this.config.PHPSESSID ? `${this.config.PHPSESSID.substring(0, 8)}...` : '未设置'
      const shortcode = this.config.SHORTCODE || '未设置'
      
      let message = `⚙️ 中兴流量插件配置\n`
      message += `━━━━━━━━━━━━━━━━━━━━\n`
      message += `PHPSESSID: ${phpsessid}\n`
      message += `SHORTCODE: ${shortcode}\n`
      message += `重试次数: ${this.config.maxRetries}\n`
      message += `重试延时: ${this.config.retryDelay}ms\n`
      message += `━━━━━━━━━━━━━━━━━━━━\n`
      message += `💡 使用说明:\n`
      message += `#中兴流量查询 - 查询设备状态\n`
      message += `#中兴流量刷新 - 刷新流量数据\n`
      message += `#中兴切网 - 执行切网操作\n`
      message += `#中兴设置 <ID> <CODE> - 设置配置\n`
      
      await e.reply(message)
    }
  }
