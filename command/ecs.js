const Core = require('@alicloud/pop-core');
const tool = require('./tool')
class ECS {

    constructor({ accessKeyId, RegionId,accessKeySecret }) {
        this.accessKeyId = accessKeyId
        this.accessKeySecret = accessKeySecret
        this.RegionId = RegionId || 'cn-zhangjiakou'
        this.InstanceType = 'ecs.g5.xlarge'
        this._init()
    }

    _init () {
        this.client = new Core({
            accessKeyId: this.accessKeyId,
            accessKeySecret: this.accessKeySecret,
            endpoint: 'https://ecs.cn-zhangjiakou.aliyuncs.com',
            apiVersion: '2014-05-26'
        });
    }

    getRequestOption () {
        return {
            method: 'POST'
        };
    }

    assertError(result,msg) {
        if (!result) {
            throw msg
        }
    }

    postRequest(params,name) {
        return new Promise((resolve, reject) => {
            this.client.request(name, params, this.getRequestOption()).then((result) => {
                resolve({ code: 200, data: result })
            })
            .catch((error) => {
                resolve({ code: 400, msg: error.toString() })
            })
        });
    }

    // 查询实例历史价格
    queryHistoryPrice() {
        const params = {
            "RegionId": this.RegionId,
            "NetworkType": "vpc",
            "InstanceType": this.InstanceType
        }
        return this.postRequest(params,'DescribeSpotPriceHistory')
    }

    // 获取镜像列表
    getImageList() {
        const params = {
            "RegionId": this.RegionId,
            "ImageName": "code-server"
        }
        return this.postRequest(params, 'DescribeImages')
    }

    // 查询安全组
    querySecurityGroups() {
        const params = {
            "RegionId": this.RegionId
        }
        return this.postRequest(params,'DescribeSecurityGroups')
    }

    // 添加安全组规则
    addEcurityGroupRule(SecurityGroupId) {
        const params = {
            RegionId: this.RegionId,
            SecurityGroupId,
            IpProtocol: 'tcp',
            SourceCidrIp: '0.0.0.0/0'
        }
        return Promise.all([
            this.postRequest({ ...params, IpProtocol: 'icmp', PortRange: '-1/-1' },'AuthorizeSecurityGroup'),
            this.postRequest({ ...params, PortRange: '22/22' },'AuthorizeSecurityGroup'),
            this.postRequest({ ...params, PortRange: '80/80' }, 'AuthorizeSecurityGroup'),
            this.postRequest({ ...params, PortRange: '8080/8080' },'AuthorizeSecurityGroup')
        ])
    }

    // 查询交换机
    querySwitches({ VpcId, ZoneId}) {
        const params = {
            RegionId: this.RegionId,
            VpcId: VpcId,
            ZoneId: ZoneId
        }
        return this.postRequest(params,'DescribeVSwitches')
    }

    // 创建模板
    async createTemplate() {
        const params = {
            ...await this.initSecurityGroupAndVSwitch(),
            "InternetMaxBandwidthOut": 100,
            "InternetChargeType": "PayByTraffic",
            "SystemDisk.Category": "cloud_efficiency",
            "SpotStrategy": "SpotAsPriceGo",
            InstanceName: 'server',
            Password:'123456789',
            RegionId:this.RegionId,
            LaunchTemplateName:'server'
        }
        return this.postRequest(params,'CreateLaunchTemplate')
    }
    
    // 初始化模板 如果有就返回模板 没有就创建
    async initTemplate() {
        const params = {
            "RegionId": this.RegionId
        }
        const templateList = await this.postRequest(params, 'DescribeLaunchTemplates')
        if (templateList.data.LaunchTemplateSets.LaunchTemplateSet.length == 0 ) {
            // 没有模板需要先创建一个模板
            return this.createTemplate()
        }else {
            return new Promise((resolve, reject) => {
                resolve({ LaunchTemplateId: templateList.data.LaunchTemplateSets.LaunchTemplateSet[0].LaunchTemplateId})
            });
        }
    }

    // 查询模板信息
    queryTemplate() {
        const params = {
            "RegionId": this.RegionId
        }
        return this.postRequest(params,'DescribeLaunchTemplates')
    }

    // 初始化 安全组 交换机
    initSecurityGroupAndVSwitch() {
        return new Promise(async(resolve, reject) => {
            // 查询镜像
            const imageList = await this.getImageList()
            this.assertError(imageList.code == 200 && imageList.data.Images.Image.length > 0, '获取镜像列表失败')
            const ImageId = tool.getFirstImage(imageList)
            // 获取价格实例
            const historyPrice = await this.queryHistoryPrice()
            this.assertError(historyPrice.code == 200, '获取实例历史价格失败')
            const ZoneId = tool.findZoneId(historyPrice.data)
            // 查询安全组
            const findEcurityGroups = await this.querySecurityGroups()
            let SecurityGroupId, VpcId, VSwitchId
            if (findEcurityGroups.data.TotalCount == 0) {

            } else {
                SecurityGroupId = findEcurityGroups.data.SecurityGroups.SecurityGroup[0].SecurityGroupId
                VpcId = findEcurityGroups.data.SecurityGroups.SecurityGroup[0].VpcId
            }
            // 添加安全组规则
            await this.addEcurityGroupRule(SecurityGroupId)
            // 查询已经存在的交换机
            const switchData = await this.querySwitches({ VpcId, ZoneId })
            VSwitchId = switchData.data.VSwitches.VSwitch[0].VSwitchId
            resolve({ ImageId, ZoneId, VSwitchId, SecurityGroupId}) 
        });
    }
    
    // 创建实例
    async create(template) {
        const params = {
            RegionId:this.RegionId,
            InstanceType:'ecs.g6.large',
            LaunchTemplateId: template.LaunchTemplateId
        }
        return this.postRequest(params,'RunInstances')
    }
    
    // 查询目前拥有的实例列表
    async queryInstancesList() {
        const params = {
            "RegionId": this.RegionId
        }
        return this.postRequest(params,'DescribeInstances')
    }

    // 删除实例
    DeleteInstance({ InstanceId}) {
        return new Promise(async (resolve, reject) => {
            const params = {
                Force: true,
                InstanceId
            }
            const result = await this.postRequest(params,'DeleteInstance')
            if (result.code == 200  && result.data) {
                resolve(result)
            }else {
                resolve(this.DeleteInstance({ InstanceId }))
            }
        });
    }

    // 永远只创建一个实例
    async createOne(template) {
        const InstancesList = await this.queryInstancesList()
        if (InstancesList.data.TotalCount > 0) {
            // 首先删除所有实例 然后重新创建一个
            console.log('删除实例中')
            for (let i = 0; i < InstancesList.data.Instances.Instance.length ; i ++ ) {
                await this.DeleteInstance({ InstanceId: InstancesList.data.Instances.Instance[i].InstanceId})
                console.log('删除实例')
            }
            return this.create(template)
        }else {
            return this.create(template)
        }
    }
    
    // 删除所有实例
    async deleteAll() {
        const InstancesList = await this.queryInstancesList()
        if (InstancesList.data.TotalCount > 0) {
            console.log('删除实例中')
            for (let i = 0; i < InstancesList.data.Instances.Instance.length; i++) {
                await this.DeleteInstance({ InstanceId: InstancesList.data.Instances.Instance[i].InstanceId })
                console.log('删除实例')
            }
        }
    }

    // 获取公网ip
    async getPublicIP({ instanceId }) {
        return new Promise((resolve, reject) => {
            const time = setInterval(async ()=>{
                const params = {
                    RegionId:this.RegionId,
                    InstanceIds: [instanceId]
                }
                const findIP = tool.getInstanceIP(await this.postRequest(params,'DescribeInstances'))
                if (findIP) {
                    clearInterval(time)
                    resolve(findIP)
                }
            },1000)
        });
    }
}
module.exports = ECS;