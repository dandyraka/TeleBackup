const si = require('systeminformation');

function timetostring(s) {
    let seconds = parseInt(s, 10);
    const days = Math.floor(seconds / (3600 * 24));
    seconds -= days * 3600 * 24;
    const hrs = Math.floor(seconds / 3600);
    seconds -= hrs * 3600;
    const mnts = Math.floor(seconds / 60);
    seconds -= mnts * 60;
    return (`${days} days, ${hrs} hours, ${mnts} minutes`);
}

module.exports = sysStats = async () => {
    try{
        const CPUTemp_data = await si.cpuTemperature();
        const Time_data = si.time();
        const Memory_data = await si.mem();
        const System_data = await si.system();
        const OS_data = await si.osInfo();
        const MemTotal = Math.floor(Memory_data.total / 1024 / 1024);
        const MemUsed = Math.floor(Memory_data.used / 1024 / 1024);
        const memPercent = Math.floor((MemUsed / MemTotal) * 100);
        const CPU_Temp = (/windows/gi).test(OS_data.distro) ? '' : `<b>CPU Temp:</b> ${CPUTemp_data.main.toPrecision(3)} °C\n`;
        return `<b>System Status</b>\n`+
        `<b>OS:</b> ${OS_data.distro} ${OS_data.release} ${OS_data.arch}\n`+
        `<b>Host:</b> ${System_data.model}\n`+
        `<b>Uptime:</b> ${timetostring(Time_data.uptime)}\n`+
        CPU_Temp+
        `<b>Memory:</b> ${MemUsed}MB / ${MemTotal}MB | ${memPercent}%\n`;
    } catch (error) {
        console.error(error);
    }
}