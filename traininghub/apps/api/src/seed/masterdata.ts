// Master data seeded into an empty TrainingHub schema: the IT Job Skills Matrix that the PHP
// application and the JSM workbook used (5 categories, 55 skills, 12 IT positions).
export const CATEGORIES = [
 {id:'beh',name:'Behavioural skills'},
 {id:'bas',name:'IT basic skills'},
 {id:'act',name:'IT department activities'},
 {id:'man',name:'Managerial skills'},
 {id:'met',name:'Methodologies & tools'}

].map((c, i) => ({ key: c.id, code: c.id.toUpperCase(), name: c.name, colorIndex: i + 1, sortOrder: (i + 1) * 10 }));

const RAW_SKILLS: [string, string, string][] = [
 ['beh','Training skills','Coaches and transfers knowledge to colleagues'],['beh','Ability to organise','Plans own work and keeps commitments'],['beh','Team work — average','Contributes inside a team setting'],['beh','Work discipline','Punctuality, policy and SLA adherence'],['beh','Team work','Builds collaboration across teams'],['beh','Motivating others','Energises the team toward goals'],['beh','Adapting to the changes','Stays effective during change'],['beh','Target focused thinking','Works backwards from measurable targets'],['beh','Self-motivation to achievements','Drives own development and results'],['beh','Others — average','General behavioural rating'],['beh','Communication abilities','Clear spoken and written communication'],
 ['bas','Work ethic','Integrity, ownership and accountability'],['bas','IT basic skill','Office tools, email, ticketing, OS basics'],['bas','Communication skills','Explains technical topics to business users'],
 ['act','Oracle Application Administration','EBS / Fusion setups, users, roles, patching'],['act','Database Administration','Oracle DB install, tuning, security'],['act','Virtualization','VMware / OCI compute administration'],['act','Integration','OIC, REST/SOAP, file-based interfaces'],['act','Backup, Recovery and Cloning','RMAN, Data Guard, EBS cloning'],['act','Zamil core values and policy','Company values, code of conduct, IT policy'],['act','Hazard Identification and Reporting','HSE hazard awareness and reporting'],['act','Basic of First Aid','First responder basics'],['act','Windows Management','AD, GPO, Windows server and endpoints'],['act','Business Analyst','Requirements, process mapping, UAT'],['act','Technical Support','L1/L2 troubleshooting for users'],['act','IT service management','ITIL incident, change and problem'],['act','Networking and wireless','LAN/WAN, Wi-Fi, firewalls, VPN'],['act','Data analytics and data science','ADW, FDI, SQL analytics, Python'],['act','Cybersecurity','Hardening, IAM, vulnerability management'],['act','Leadership skills','Leads initiatives without formal authority'],['act','Presentation skills','Presents to management and users'],['act','Project Planning and Management','Scope, schedule, RAID, status reporting'],['act','Application Functional Skills','Fusion SCM / HCM / Finance business flows'],
 ['man','Delegating the responsibilities','Assigns work with clear ownership'],['man','Decision making','Makes timely, informed decisions'],['man','Being a leader','Sets direction and models behaviour'],['man','Leading a team — average','Day-to-day team leadership rating'],
 ['met','Programming','PL/SQL, Java, JavaScript, PHP'],['met','Cloud Fusion SaaS','Fusion configuration, BIP, OTBI, HDL/FBDI'],['met','Full stack development','React, Node.js, APEX, REST APIs'],['met','Problem solving tools','5 Whys, fishbone, A3, 8D'],['met','AI and machine learning','GenAI use cases, prompt design, ML basics'],['met','Agile / Scrum','Sprints, backlog, ceremonies'],['met','ITIL 4 practices','Service value chain and practices'],['met','DevOps and CI/CD','Git, pipelines, release automation'],['met','Power BI / reporting','Dashboards, DAX, data modelling'],['met','Oracle implementation methodology','OUM / AIM phases and deliverables'],['met','Change management','Stakeholder readiness and adoption'],['met','Documentation and SOPs','Process docs, run books, KB articles'],['met','Vendor management','SLAs, contracts, partner governance'],['met','ISO 9001 / 27001 awareness','Quality and information security standards'],['met','Risk management','Identify, rate and mitigate risks'],['met','Automation / RPA','Scripting, scheduled jobs, bots'],['met','API design','Contract-first REST, versioning, security'],['met','Low-code (Oracle APEX)','Rapid internal app delivery']
];

const code = (name: string) =>
  name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30);
export const SKILLS = RAW_SKILLS.map(([cat, name, desc], i) => ({ n: i + 1, cat, name, desc, code: code(name) }));

export interface SeedPosition {
  id: string; name: string; grade: string; hc: number; mgr: string; status: string; ver: number;
  core: number[]; sec: number[]; aw: number[]; mgmt: string;
}
export const POSITIONS: SeedPosition[] = [
 {id:'sup',name:'IT Supervisor',grade:'G9',hc:4,mgr:'IT Manager',status:'ok',ver:3,core:[15,16,19,18,32,33,26,39],sec:[17,23,27,29,24,28,38,47,48,51],aw:[25,40,41,45,46],mgmt:'R'},
 {id:'mgr',name:'IT Manager',grade:'G11',hc:1,mgr:'Head of Operations',status:'ok',ver:4,core:[32,26,29,30,31,51,49],sec:[15,24,28,33,39,48,53],aw:[16,17,18,19,27,38,42],mgmt:'R'},
 {id:'ora',name:'Oracle Applications Lead',grade:'G9',hc:2,mgr:'IT Supervisor',status:'dr',ver:2,core:[15,33,39,18,24,48],sec:[16,19,32,38,40,55,28],aw:[29,26,46,47],mgmt:'O'},
 {id:'fun',name:'ERP Functional Consultant',grade:'G8',hc:3,mgr:'Oracle Applications Lead',status:'ok',ver:3,core:[33,24,39,50],sec:[28,32,31,48,49],aw:[15,18,38,47],mgmt:'U'},
 {id:'dba',name:'Database Administrator',grade:'G8',hc:2,mgr:'IT Supervisor',status:'ok',ver:3,core:[16,19,15,17],sec:[29,38,54,27,45],aw:[18,28,46],mgmt:'U'},
 {id:'net',name:'Network Engineer',grade:'G7',hc:2,mgr:'IT Supervisor',status:'pe',ver:2,core:[27,29,23],sec:[17,26,25,54],aw:[16,45,52],mgmt:'U'},
 {id:'sys',name:'System Administrator',grade:'G7',hc:3,mgr:'IT Supervisor',status:'ok',ver:3,core:[23,17,25,26],sec:[27,29,19,54],aw:[16,45],mgmt:'U'},
 {id:'hel',name:'Helpdesk Technician',grade:'G5',hc:5,mgr:'System Administrator',status:'dr',ver:1,core:[25,13,23],sec:[26,27,50],aw:[29],mgmt:'N'},
 {id:'dev',name:'Software Developer',grade:'G7',hc:3,mgr:'IT Supervisor',status:'ok',ver:2,core:[38,40,55,18,54],sec:[44,46,16,42,43],aw:[24,29,47],mgmt:'U'},
 {id:'ba',name:'Business Analyst',grade:'G7',hc:1,mgr:'IT Manager',status:'no',ver:0,core:[24,33,50,31],sec:[28,32,47,49],aw:[39,44],mgmt:'U'},
 {id:'da',name:'Data Analyst',grade:'G7',hc:2,mgr:'IT Supervisor',status:'pe',ver:1,core:[28,47,38],sec:[39,42,24],aw:[16,29],mgmt:'U'},
 {id:'sec',name:'Cybersecurity Specialist',grade:'G8',hc:1,mgr:'IT Manager',status:'no',ver:0,core:[29,27,52],sec:[23,26,53,54],aw:[16,17,45],mgmt:'U'}
];
