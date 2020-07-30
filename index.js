const ECS = require('./command/ecs')
const tool = require('./command/tool')

async function main () {
  try {
    let start = Date.now()
    const client = new ECS({ accessKeyId: '你的accessKeyId', accessKeySecret: '你的accessKeySecret' })
    await client.deleteAll()
    // const template = await client.initTemplate()
    // const createData = await client.createOne(template)
    // const instanceId = tool.getCreateInstanceId(createData)
    // const ip = await client.getPublicIP({instanceId})
    console.log('使用时间',Date.now() - start) 
  } catch (error) {
    console.log('输出错误',error)
  }
}

main()
