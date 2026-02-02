class ProjectRepository {
    constructor() {
        this.projects = [
            { id: 'p1', name: 'Antigravity Stack' },
            { id: 'p2', name: 'Deepmind Core' },
            { id: 'p3', name: 'Mars Rover UI' },
            { id: 'p4', name: 'Ecosystem Sync' }
        ];
    }

    getAll() {
        return this.projects;
    }
}

module.exports = new ProjectRepository();
