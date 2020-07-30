// 获取镜像id
function getFirstImage(imageList) {
    return imageList.data.Images.Image[0].ImageId
}

// 获取区块
function findZoneId(data) {
    return data.SpotPrices.SpotPriceType.sort((p1, p2) => p1.SpotPrice - p2.SpotPrice)[0].ZoneId
}

// 获取创建完以后的实例id
function getCreateInstanceId(instanceData) {
    return instanceData.data.InstanceIdSets.InstanceIdSet[0]
}

// 获取ip
function getInstanceIP(instanceData) {
    if (instanceData.data.TotalCount > 0 ) {
        const find = instanceData.data.Instances.Instance.find((e) => e.PublicIpAddress.IpAddress.length > 0)
        if (find) {
            return find.PublicIpAddress.IpAddress[0]
        }else {
            return ''
        }
    }else {
        return ''
    }
}
module.exports = {
    getFirstImage,
    findZoneId,
    getCreateInstanceId,
    getInstanceIP
}