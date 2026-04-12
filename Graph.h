/*

Mkswll's Graph and Tree classes

*/
struct Graph {
	int n;
	vector<vector<int>> adj;
	
	Graph() {}
	
	Graph(int _n): n{_n}, adj(_n + 1) {};
	
	void add(int u, int v) {
		adj[u].push_back(v);
	}
	
	vector<int> &next(int u) {
		return adj[u];
	}
};

struct Tree : public Graph {
	int rt;
	
	Tree(int _n, int _rt = 1): Graph{_n}, rt{_rt} {}
};
