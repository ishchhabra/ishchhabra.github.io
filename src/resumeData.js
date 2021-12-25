let resumeData = {
	first_name: "Ish",
	last_name: "Chhabra",
	linkedin: "https://www.linkedin.com/in/ishchhabra/",
	github: "https://github.com/ishchhabra",
	description: "I am a senior studying Computer Science at UMass Amherst graduating in December 2022.",
	about_me: "I do computers.",
	address: "Amherst, MA",
	education: [
		{
			name: "University of Massachusetts Amherst",
			major: "Computer Science",
			grduationMonth: 12,
			graduationYear: 2022,
			achievements: ["Dean's List Spring '21", "Dean's List Fall '20", "Dean's List Spring '20", " Dean's List Fall '19"],
		},
	],
	works: [
		{
			company: "Gordian Software",
			title: "Software Developer Intern (Python)",
			monthOfJoining: 5,
			yearOfJoining: 2021,
			monthOfLeaving: 8,
			yearOfLeaving: 2021,
			bullet_points: [
				"Create software and API to serve clients in the travel industry.",
				"Develop tests &ndash; unit testing and regression testing.",
				"Write web scrapers to extract flight data from different airlines.",
				"Develop solutions to bypass state-of-the-art anti-bot blockers by Akamai and Incapsula to facilitate web scraping.",
				"Develop tools to decrease development time and increase test coverage.",
			],
			include_in_pdf: true,
		},
		{
			company: "CICS, UMass",
			title: "Full Stack Developer (Intern)",
			monthOfJoining: 6,
			yearOfJoining: 2020,
			monthOfLeaving: 8,
			yearOfLeaving: 2020,
			bullet_points: [
				"Project <b><a href='https://reachout.cics.umass.edu' target='_blank'>ReachOUT</a></b> <br />",
				"Integrate multiple endpoints of the application with AWS S3.",
				"Design, develop, and validate multiple React components to render the component.",
				"Write AWS Lambda functions in Python to expose API endpoints for the frontend.",
				"Implement string internationalization and time-zone conversion for the application to increase availability to foreign users.",
				"Backend Optimization to reduce data transfer between the client and the host by 3x.",
			],
		},
		{
			company: "Hungry Stabbers Gaming",
			title: "Software Developer/Co-Founder",
			monthOfJoining: 8,
			yearOfJoining: 2017,
			monthOfLeaving: 3,
			yearOfLeaving: 2019,
			bullet_points: [
				"Ranked 1 Counter-Strike gaming community from 2017 to 2019.",
				"Design, develop, test, and maintain multiple Counter-Strike 1.6 servers on AWS.",
				"Develop the security infrastructure using AWS SDK for the servers with automated scripts to counter nefarious attacks.",
				"Develop game mods in a C based scripting language called AMXMODX.",
				"Foster a fun and friendly gaming environment in a community with 2000+ members.",
			],
		},
	],
	projects: [
		{
			name: "EthiSim (Ethics Simulator)",
			startMonth: 2,
			startYear: 2020,
			endMonth: 5,
			endYear: 2020,
			bullet_points: [
				"Install, configure, and maintain Apache web server on CentOS 8.",
				"Install and configure Shibboleth Service Provider as a module on Apache to integrate UMass Single Sign-On with the web application.",
				"Integrate SSO with Django endpoints.",
				"Implement reverse proxy to forward requests to multiple applications running inside separate docker containers.",
			],
		},
	],
};

export default resumeData;
